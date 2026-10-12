//go:build darwin

package resourceprofile

import "golang.org/x/sys/unix"

func hostMemory() (Signal[uint64], Signal[uint64]) {
	total := state[uint64]("unknown", "sysctl hw.memsize")
	if v, e := unix.SysctlUint64("hw.memsize"); e == nil {
		total = known(v, "sysctl hw.memsize")
	}
	// Free/inactive/reclaimable pages are not a trustworthy MemAvailable equivalent.
	return total, state[uint64]("unknown", "darwin: no trustworthy host-available estimate collected")
}
