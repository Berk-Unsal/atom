//go:build !darwin && !linux

package resourceprofile

func hostMemory() (Signal[uint64], Signal[uint64]) {
	return state[uint64]("unknown", "unsupported OS"), state[uint64]("unknown", "unsupported OS")
}
