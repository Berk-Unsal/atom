package resourceprofile

import (
	"os"
	"sort"
	"strconv"
	"strings"
)

func readNumber(p Provider, path string, limit bool) Signal[uint64] {
	b, e := p.ReadFile(path)
	if e != nil {
		st := "unknown"
		if os.IsNotExist(e) {
			st = "absent"
		}
		return state[uint64](st, path)
	}
	v := strings.TrimSpace(string(b))
	if limit && v == "max" {
		return state[uint64]("unlimited", path)
	}
	n, e := strconv.ParseUint(v, 10, 64)
	if e != nil {
		return state[uint64]("unknown", path)
	}
	// Legacy v1 PAGE_COUNTER_MAX sentinel, not a usable allocation.
	if limit && strings.Contains(path, "memory.") && strings.HasSuffix(path, "_in_bytes") && (n >= uint64(1<<63-65536) || n == uint64(1<<31-4096) || n == uint64(1<<31-16384) || n == uint64(1<<31-65536)) {
		return state[uint64]("unlimited", path)
	}
	return known(n, path)
}
func parseMeminfo(raw string) (Signal[uint64], Signal[uint64]) {
	total, available := state[uint64]("unknown", "/proc/meminfo MemTotal"), state[uint64]("unknown", "/proc/meminfo MemAvailable")
	for _, line := range strings.Split(raw, "\n") {
		f := strings.Fields(line)
		if len(f) != 3 || f[2] != "kB" {
			continue
		}
		n, e := strconv.ParseUint(f[1], 10, 64)
		if e != nil || n > ^uint64(0)/1024 {
			continue
		}
		if f[0] == "MemTotal:" && n > 0 {
			total = known(n*1024, total.Sources[0])
		}
		if f[0] == "MemAvailable:" {
			available = known(n*1024, available.Sources[0])
		}
	}
	return total, available
}
func parseCPUSet(raw string) (int, bool) {
	type interval struct{ lo, hi int }
	ranges := []interval{}
	for _, part := range strings.Split(strings.TrimSpace(raw), ",") {
		f := strings.Split(part, "-")
		if len(f) > 2 || len(f) == 0 {
			return 0, false
		}
		lo, e := strconv.Atoi(f[0])
		if e != nil || lo < 0 {
			return 0, false
		}
		hi := lo
		if len(f) == 2 {
			hi, e = strconv.Atoi(f[1])
			if e != nil || hi < lo {
				return 0, false
			}
		}
		if hi > 1<<20 {
			return 0, false
		}
		ranges = append(ranges, interval{lo, hi})
	}
	sort.Slice(ranges, func(i, j int) bool { return ranges[i].lo < ranges[j].lo })
	n, last := 0, -1
	for _, r := range ranges {
		if r.lo <= last {
			return 0, false
		}
		n += r.hi - r.lo + 1
		last = r.hi
	}
	return n, n > 0
}
func readCPUSet(p Provider, path string) Signal[int] {
	b, e := p.ReadFile(path)
	if e != nil {
		st := "unknown"
		if os.IsNotExist(e) {
			st = "absent"
		}
		return state[int](st, path)
	}
	n, ok := parseCPUSet(string(b))
	if !ok {
		return state[int]("unknown", path)
	}
	return known(n, path)
}
