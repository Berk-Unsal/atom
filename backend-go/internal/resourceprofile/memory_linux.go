//go:build linux

package resourceprofile

import "os"

func hostMemory() (Signal[uint64], Signal[uint64]) {
	b, e := os.ReadFile("/proc/meminfo")
	if e != nil {
		return state[uint64]("unknown", "/proc/meminfo MemTotal"), state[uint64]("unknown", "/proc/meminfo MemAvailable")
	}
	return parseMeminfo(string(b))
}
