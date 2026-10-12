package resourceprofile

import (
	"os"
	"path"
	"strconv"
	"strings"
)

type hierarchy struct{ leaf, root, version string }

// Resolve membership through mountinfo: never assume /sys/fs/cgroup is the
// process's cgroup. Namespace roots and nonstandard controller mounts work too.
func resolveHierarchies(membership, mountinfo string) map[string]hierarchy {
	members := map[string]string{}
	for _, line := range strings.Split(membership, "\n") {
		f := strings.SplitN(line, ":", 3)
		if len(f) != 3 || !strings.HasPrefix(f[2], "/") || strings.HasSuffix(f[2], " (deleted)") {
			continue
		}
		if f[0] == "0" && f[1] == "" {
			members["v2"] = path.Clean(f[2])
		} else {
			for _, controller := range strings.Split(f[1], ",") {
				members[controller] = path.Clean(f[2])
			}
		}
	}
	result := map[string]hierarchy{}
	for _, line := range strings.Split(mountinfo, "\n") {
		parts := strings.SplitN(line, " - ", 2)
		if len(parts) != 2 {
			continue
		}
		left, right := strings.Fields(parts[0]), strings.Fields(parts[1])
		if len(left) < 6 || len(right) < 3 {
			continue
		}
		if right[0] != "cgroup" && right[0] != "cgroup2" {
			continue
		}
		root, mount := path.Clean(unescapeMount(left[3])), path.Clean(unescapeMount(left[4]))
		if !strings.HasPrefix(root, "/") || !strings.HasPrefix(mount, "/") {
			continue
		}
		keys := strings.Split(right[2], ",")
		version := "v1"
		if right[0] == "cgroup2" {
			keys = []string{"v2"}
			version = "v2"
		}
		for _, key := range keys {
			member, ok := members[key]
			if !ok {
				continue
			}
			relative := ""
			if member == root {
				relative = ""
			} else if root == "/" {
				relative = strings.TrimPrefix(member, "/")
			} else if strings.HasPrefix(member, root+"/") {
				relative = strings.TrimPrefix(member, root+"/")
			} else {
				continue
			}
			candidate := hierarchy{path.Join(mount, relative), mount, version}
			previous, exists := result[key]
			if !exists || len(candidate.leaf)-len(candidate.root) > len(previous.leaf)-len(previous.root) {
				result[key] = candidate
			}
		}
	}
	return result
}
func ancestry(h hierarchy) []string {
	dirs := []string{}
	// A resolved absolute path is finite; walk to its mount root without
	// silently discarding deeper visible ancestor constraints.
	for dir := h.leaf; ; dir = path.Dir(dir) {
		dirs = append(dirs, dir)
		if dir == h.root || dir == "/" {
			break
		}
	}
	return dirs
}
func readQuota(p Provider, dir, version string) (Signal[float64], Signal[uint64], Signal[uint64]) {
	if version == "v2" {
		file := path.Join(dir, "cpu.max")
		b, e := p.ReadFile(file)
		if e != nil {
			st := "unknown"
			if isAbsent(e) {
				st = "absent"
			}
			return state[float64](st, file), state[uint64](st, file), state[uint64](st, file)
		}
		f := strings.Fields(string(b))
		if len(f) != 2 {
			return state[float64]("unknown", file), state[uint64]("unknown", file), state[uint64]("unknown", file)
		}
		period, e := strconv.ParseUint(f[1], 10, 64)
		if e != nil || period == 0 {
			return state[float64]("unknown", file), state[uint64]("unknown", file), state[uint64]("unknown", file)
		}
		if f[0] == "max" {
			return state[float64]("unlimited", file), state[uint64]("unlimited", file), known(period, file)
		}
		quota, e := strconv.ParseUint(f[0], 10, 64)
		if e != nil || quota == 0 {
			return state[float64]("unknown", file), state[uint64]("unknown", file), known(period, file)
		}
		return known(float64(quota)/float64(period), file), known(quota, file), known(period, file)
	}
	quotaFile, periodFile := path.Join(dir, "cpu.cfs_quota_us"), path.Join(dir, "cpu.cfs_period_us")
	b, e := p.ReadFile(quotaFile)
	period := readNumber(p, periodFile, false)
	if e != nil {
		st := "unknown"
		if isAbsent(e) {
			st = "absent"
		}
		return state[float64](st, quotaFile), state[uint64](st, quotaFile), period
	}
	quota, e := strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64)
	if e != nil || quota == 0 || quota < -1 || period.Value == nil || *period.Value == 0 {
		return state[float64]("unknown", quotaFile), state[uint64]("unknown", quotaFile), period
	}
	if quota == -1 {
		return state[float64]("unlimited", quotaFile), state[uint64]("unlimited", quotaFile), period
	}
	return known(float64(quota)/float64(*period.Value), quotaFile+" / "+periodFile), known(uint64(quota), quotaFile), period
}
func discoverCgroups(p Provider, s *Snapshot) {
	membership, me := p.ReadFile("/proc/self/cgroup")
	mountinfo, mi := p.ReadFile("/proc/self/mountinfo")
	if me != nil || mi != nil {
		s.CgroupVersion = "unknown"
		s.CPU.Quota = state[float64]("unknown", "/proc/self/cgroup + /proc/self/mountinfo")
		s.CPU.CPUSet = state[int]("unknown", "cgroup resolution")
		s.Memory.Limit = state[uint64]("unknown", "cgroup resolution")
		s.Memory.High = s.Memory.Limit
		s.Memory.Current = s.Memory.Limit
		s.CPU.QuotaMicros = state[uint64]("unknown", "cgroup resolution")
		s.CPU.PeriodMicros = s.CPU.QuotaMicros
		s.warn("cgroup membership or mount information unavailable")
		return
	}
	hs := resolveHierarchies(string(membership), string(mountinfo))
	if len(hs) == 0 {
		if strings.TrimSpace(string(membership)) != "" {
			s.CgroupVersion = "unknown"
			s.CPU.Quota = state[float64]("unknown", "cgroup resolution")
			s.Memory.Limit = state[uint64]("unknown", "cgroup resolution")
			s.CPU.CPUSet = state[int]("unknown", "cgroup resolution")
			s.CPU.QuotaMicros = state[uint64]("unknown", "cgroup resolution")
			s.CPU.PeriodMicros = s.CPU.QuotaMicros
			s.Memory.High = s.Memory.Limit
			s.Memory.Current = s.Memory.Limit
			s.warn("process cgroup could not be resolved")
		}
		return
	}
	choose := func(controller string) (hierarchy, bool) {
		if h, ok := hs[controller]; ok {
			return h, true
		}
		h, ok := hs["v2"]
		return h, ok
	}
	versions := map[string]bool{}
	for _, h := range hs {
		versions[h.version] = true
	}
	s.CgroupVersion = "v1"
	if versions["v2"] {
		s.CgroupVersion = "v2"
	}
	if len(versions) > 1 {
		s.CgroupVersion = "hybrid"
	}
	if h, ok := choose("cpu"); ok {
		s.CPU.Quota = state[float64]("absent", "visible CPU hierarchy")
		for i, dir := range ancestry(h) {
			q, quota, period := readQuota(p, dir, h.version)
			if i == 0 {
				s.CPU.QuotaMicros = quota
				s.CPU.PeriodMicros = period
			}
			s.CPU.Quota = minimum(s.CPU.Quota, q)
			if q.State == "unknown" {
				s.warn("CPU quota incomplete or malformed")
			}
		}
	}
	if h, ok := choose("cpuset"); ok {
		file := "cpuset.cpus.effective"
		if h.version == "v1" {
			file = "cpuset.effective_cpus"
		}
		s.CPU.CPUSet = readCPUSet(p, path.Join(h.leaf, file))
		if s.CPU.CPUSet.State == "absent" && h.version == "v1" {
			for _, dir := range ancestry(h) {
				b, e := p.ReadFile(path.Join(dir, "cpuset.cpus"))
				if e == nil && strings.TrimSpace(string(b)) == "" {
					continue
				}
				v := readCPUSet(p, path.Join(dir, "cpuset.cpus"))
				s.CPU.CPUSet = v
				if v.State != "absent" {
					break
				}
			}
		}
		if s.CPU.CPUSet.State == "unknown" {
			s.warn("cpuset incomplete or malformed")
		}
	}
	if h, ok := choose("memory"); ok {
		limit, high, current := "memory.max", "memory.high", "memory.current"
		if h.version == "v1" {
			limit, high, current = "memory.limit_in_bytes", "memory.soft_limit_in_bytes", "memory.usage_in_bytes"
		}
		for _, dir := range ancestry(h) {
			l, hi := readNumber(p, path.Join(dir, limit), true), readNumber(p, path.Join(dir, high), true)
			s.Memory.Limit = minimum(s.Memory.Limit, l)
			s.Memory.High = minimum(s.Memory.High, hi)
			if l.State == "unknown" || hi.State == "unknown" {
				s.warn("memory thresholds incomplete or malformed")
			}
		}
		s.Memory.Current = readNumber(p, path.Join(h.leaf, current), false)
		if s.Memory.Current.State == "unknown" {
			s.warn("cgroup memory usage unavailable")
		}
	}
}

func isAbsent(err error) bool { return os.IsNotExist(err) }
