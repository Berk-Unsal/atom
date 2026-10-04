package resourceprofile

import (
	"encoding/json"
	"os"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

func fixture(files map[string]string) Provider {
	return Provider{ReadFile: func(name string) ([]byte, error) {
		v, ok := files[name]
		if !ok {
			return nil, os.ErrNotExist
		}
		return []byte(v), nil
	}, NumCPU: func() int { return 10 }, GOMAXPROCS: func() int { return 10 }, OS: "linux", Arch: "arm64", GoVersion: "test", HostMemory: func() (Signal[uint64], Signal[uint64]) {
		return known(uint64(12<<30), "test host total"), known(uint64(6<<30), "test availability")
	}, RuntimeLimits: func() (Signal[uint64], Signal[uint64]) {
		return state[uint64]("unlimited", "test Go limit"), known(uint64(100), "test GC")
	}}
}
func v2Files() map[string]string {
	return map[string]string{"/proc/self/cgroup": "0::/\n", "/proc/self/mountinfo": "29 23 0:26 / /sys/fs/cgroup rw - cgroup2 cgroup rw\n", "/sys/fs/cgroup/cpu.max": "max 100000", "/sys/fs/cgroup/cpuset.cpus.effective": "0-9", "/sys/fs/cgroup/memory.max": "max", "/sys/fs/cgroup/memory.high": "max", "/sys/fs/cgroup/memory.current": "1234"}
}
func capture(p Provider) Snapshot { return Collect(p, RFPolicy{}, Experiments{}, Dataset{}).View() }
func TestCPUDiscovery(t *testing.T) {
	for _, tc := range []struct {
		name, quota, cpuset string
		gomax               int
		want                float64
		st                  string
	}{
		{"no quota", "max 100000", "0-9", 10, 10, "unlimited"},
		{"integer", "200000 100000", "0-9", 10, 2, "known"},
		{"fractional", "150000 100000", "0-9", 10, 1.5, "known"},
		{"sub core", "25000 100000", "0-9", 10, .25, "known"},
		{"cpuset smaller", "400000 100000", "2-3", 10, 2, "known"},
		{"scheduler smaller", "800000 100000", "0-9", 3, 3, "known"},
		{"malformed", "oops", "0-9", 10, 10, "unknown"},
		{"zero period", "20000 0", "0-9", 10, 10, "unknown"},
		{"missing", "", "0-9", 10, 10, "absent"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := v2Files()
			if tc.quota == "" {
				delete(f, "/sys/fs/cgroup/cpu.max")
			} else {
				f["/sys/fs/cgroup/cpu.max"] = tc.quota
			}
			f["/sys/fs/cgroup/cpuset.cpus.effective"] = tc.cpuset
			p := fixture(f)
			p.GOMAXPROCS = func() int { return tc.gomax }
			s := capture(p)
			if *s.CPU.Effective.Value != tc.want || s.CPU.Quota.State != tc.st {
				t.Fatalf("%+v", s.CPU)
			}
			if len(s.CPU.Effective.Sources) < 3 {
				t.Fatal("lost provenance")
			}
		})
	}
}
func TestMemoryDiscovery(t *testing.T) {
	for _, tc := range []struct {
		name, max, high, current string
		want                     uint64
		st                       string
	}{
		{"finite", "4294967296", "2147483648", "1234", 4 << 30, "known"},
		{"unlimited", "max", "max", "1234", 12 << 30, "unlimited"},
		{"host smaller", "17179869184", "max", "0", 12 << 30, "known"},
		{"malformed", "bad", "bad", "bad", 12 << 30, "unknown"},
		{"absent", "", "", "", 12 << 30, "absent"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := v2Files()
			for file, v := range map[string]string{"memory.max": tc.max, "memory.high": tc.high, "memory.current": tc.current} {
				if v == "" {
					delete(f, "/sys/fs/cgroup/"+file)
				} else {
					f["/sys/fs/cgroup/"+file] = v
				}
			}
			s := capture(fixture(f))
			if s.Memory.Limit.State != tc.st || *s.Memory.Effective.Value != tc.want {
				t.Fatalf("%+v", s.Memory)
			}
			if tc.name == "finite" && (*s.Memory.High.Value != 2<<30 || *s.Memory.Current.Value != 1234) {
				t.Fatal("threshold or usage conflated")
			}
		})
	}
}
func TestV1(t *testing.T) {
	f := map[string]string{
		"/proc/self/cgroup":                 "2:cpu,cpuacct:/team/atom\n3:memory:/team/atom\n4:cpuset:/team/atom",
		"/proc/self/mountinfo":              "1 0 0:1 /team /limits/cpu rw - cgroup cgroup rw,cpu,cpuacct\n2 0 0:2 /team /limits/memory rw - cgroup cgroup rw,memory\n3 0 0:3 /team /limits/cpuset rw - cgroup cgroup rw,cpuset",
		"/limits/cpu/atom/cpu.cfs_quota_us": "150000", "/limits/cpu/atom/cpu.cfs_period_us": "100000",
		"/limits/memory/atom/memory.limit_in_bytes": "9223372036854771712", "/limits/memory/atom/memory.soft_limit_in_bytes": "2147483648", "/limits/memory/atom/memory.usage_in_bytes": "42",
		"/limits/cpuset/atom/cpuset.cpus": "", "/limits/cpuset/cpuset.cpus": "0-1",
	}
	s := capture(fixture(f))
	if s.CgroupVersion != "v1" || *s.CPU.Quota.Value != 1.5 || *s.CPU.CPUSet.Value != 2 || s.Memory.Limit.State != "unlimited" || *s.Memory.High.Value != 2<<30 || *s.Memory.Current.Value != 42 {
		t.Fatalf("%+v", s)
	}
	f["/limits/cpu/atom/cpu.cfs_quota_us"] = "-1"
	if capture(fixture(f)).CPU.Quota.State != "unlimited" {
		t.Fatal("v1 -1")
	}
	f["/limits/memory/atom/memory.limit_in_bytes"] = "2147479552"
	if capture(fixture(f)).Memory.Limit.State != "unlimited" {
		t.Fatal("v1 32 bit sentinel")
	}
	f["/limits/memory/atom/memory.limit_in_bytes"] = "9223372036854710272"
	if capture(fixture(f)).Memory.Limit.State != "unlimited" {
		t.Fatal("64 KiB page sentinel")
	}

}
func TestVisibleAncestorsAndMountEscapes(t *testing.T) {
	f := v2Files()
	f["/proc/self/cgroup"] = "0::/team/child"
	f["/proc/self/mountinfo"] = `29 23 0:26 /team /limits\040test rw - cgroup2 cgroup rw`
	f["/limits test/child/cpu.max"] = "400000 100000"
	f["/limits test/cpu.max"] = "150000 100000"
	f["/limits test/child/memory.max"] = "max"
	f["/limits test/memory.max"] = "4294967296"
	s := capture(fixture(f))
	if *s.CPU.Quota.Value != 1.5 || *s.Memory.Limit.Value != 4<<30 {
		t.Fatal(s)
	}
	if s.Environment != "unknown" {
		t.Fatal("cgroup alone is not container evidence")
	}
	if len(s.CPU.Quota.Sources) < 3 {
		t.Fatal("ancestor provenance lost")
	}
}
func TestFailuresAndUnsupportedPlatform(t *testing.T) {
	p := fixture(nil)
	s := capture(p)
	if s.CgroupVersion != "unknown" || s.CPU.Quota.State != "unknown" || s.Memory.Limit.State != "unknown" || len(s.Warnings) == 0 {
		t.Fatal(s)
	}
	p.OS = "other"
	p.HostMemory = func() (Signal[uint64], Signal[uint64]) {
		return state[uint64]("unknown", "unsupported"), state[uint64]("unknown", "unsupported")
	}
	s = capture(p)
	if s.Memory.Effective.State != "unknown" || s.Memory.Effective.Value != nil {
		t.Fatal("invented memory")
	}
	p = fixture(v2Files())
	original := p.ReadFile
	p.ReadFile = func(name string) ([]byte, error) {
		if name == "/sys/fs/cgroup/memory.max" {
			return nil, os.ErrPermission
		}
		return original(name)
	}
	if capture(p).Memory.Limit.State != "unknown" {
		t.Fatal("unreadable limit must be unknown")
	}
}
func TestParsers(t *testing.T) {
	for _, v := range []string{"", "-1", "1-0", "0-2,2-4", "1,,2", "0-9999999999999999", "1-2-3"} {
		if _, ok := parseCPUSet(v); ok {
			t.Fatal(v)
		}
	}
	n, ok := parseCPUSet("0-2,5,8-9\n")
	if !ok || n != 6 {
		t.Fatal(n)
	}
	total, available := parseMeminfo("MemTotal: 100 kB\nMemAvailable: 40 kB\n")
	if *total.Value != 102400 || *available.Value != 40960 {
		t.Fatal("meminfo units")
	}
	total, _ = parseMeminfo("MemTotal: 18446744073709551615 kB")
	if total.State != "unknown" {
		t.Fatal("overflow")
	}
}
func TestImmutableIdentity(t *testing.T) {
	f := v2Files()
	p := fixture(f)
	dataset := Dataset{State: "known", ID: "test", SHA256: map[string]string{"file": "hash"}, Source: "test"}
	profile := Collect(p, RFPolicy{}, Experiments{}, dataset)
	view := profile.View()
	fingerprint := view.Fingerprint
	dataset.SHA256["file"] = "changed"
	view.Dataset.SHA256["file"] = "mutated"
	if profile.View().Dataset.SHA256["file"] != "hash" {
		t.Fatal("mutable retained profile")
	}
	f["/sys/fs/cgroup/memory.current"] = "9999"
	p.HostMemory = func() (Signal[uint64], Signal[uint64]) {
		return known(uint64(12<<30), "test host total"), known(uint64(1), "test availability")
	}
	dataset.SHA256["file"] = "hash"
	if Collect(p, RFPolicy{}, Experiments{}, dataset).View().Fingerprint != fingerprint {
		t.Fatal("dynamic values changed diagnostic identity")
	}
	f["/sys/fs/cgroup/cpu.max"] = "200000 100000"
	if Collect(p, RFPolicy{}, Experiments{}, dataset).View().Fingerprint == fingerprint {
		t.Fatal("constraint missing from identity")
	}
	raw, _ := json.Marshal(profile)
	var decoded Snapshot
	if json.Unmarshal(raw, &decoded) != nil || !reflect.DeepEqual(decoded, profile.View()) {
		t.Fatal("serialization")
	}
}
func TestSystemCollectionDoesNotSetScheduler(t *testing.T) {
	before := runtime.GOMAXPROCS(0)
	profile := Collect(SystemProvider(), RFPolicy{}, Experiments{}, Dataset{})
	if profile.View().Mode != "auto" || runtime.GOMAXPROCS(0) != before {
		t.Fatal("profiling changed scheduler")
	}
}

func TestAbsentAndMalformedControllers(t *testing.T) {
	p := fixture(map[string]string{"/proc/self/cgroup": "", "/proc/self/mountinfo": ""})
	s := capture(p)
	if s.CgroupVersion != "absent" || s.CPU.Quota.State != "absent" || s.Memory.Limit.State != "absent" {
		t.Fatal(s)
	}
	f := v2Files()
	f["/sys/fs/cgroup/cpuset.cpus.effective"] = "0-2,2"
	s = capture(fixture(f))
	if s.CPU.CPUSet.State != "unknown" || len(s.Warnings) == 0 {
		t.Fatal(s)
	}
	f["/proc/self/cgroup"] = "0::/missing (deleted)"
	s = capture(fixture(f))
	if s.CgroupVersion != "unknown" {
		t.Fatal("deleted membership")
	}
}
func TestHybridAndUnreadableAncestor(t *testing.T) {
	f := v2Files()
	f["/proc/self/cgroup"] = "0::/child\n2:cpu,cpuacct:/atom"
	f["/proc/self/mountinfo"] += "\n30 23 0:27 / /legacy rw - cgroup cgroup rw,cpu,cpuacct"
	f["/legacy/atom/cpu.cfs_quota_us"] = "25000"
	f["/legacy/atom/cpu.cfs_period_us"] = "100000"
	f["/sys/fs/cgroup/child/memory.max"] = "4294967296"
	f["/sys/fs/cgroup/memory.max"] = "bad"
	s := capture(fixture(f))
	if s.CgroupVersion != "hybrid" || *s.CPU.Quota.Value != .25 || *s.Memory.Limit.Value != 4<<30 || len(s.Warnings) == 0 {
		t.Fatal(s)
	}
	// A known observed upper bound remains useful, with explicit incomplete evidence.
	if len(s.Memory.Limit.Sources) < 3 || len(s.Memory.Limit.UnknownSources) == 0 || len(s.Memory.Effective.UnknownSources) == 0 {
		t.Fatal("partial evidence lost")
	}
	f["/legacy/atom/cpu.cfs_quota_us"] = "-2"
	if capture(fixture(f)).CPU.Quota.State != "unknown" {
		t.Fatal("invalid negative quota")
	}
}

func TestDeepVisibleAncestryIsNotTruncated(t *testing.T) {
	h := hierarchy{leaf: "/mount" + strings.Repeat("/child", 130), root: "/mount", version: "v2"}
	dirs := ancestry(h)
	if len(dirs) != 131 || dirs[len(dirs)-1] != h.root {
		t.Fatal("visible ancestor constraints silently truncated")
	}
}
