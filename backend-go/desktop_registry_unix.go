//go:build unix

package main

import (
	"errors"
	"io"
	"os"
	"syscall"
)

func readDesktopRegistryFile(path string) ([]byte, error) {
	fd, err := syscall.Open(path, syscall.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK|syscall.O_CLOEXEC, 0)
	if err != nil {
		return nil, err
	}
	file := os.NewFile(uintptr(fd), "desktop dataset registry")
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		return nil, err
	}
	owner, ok := stat.Sys().(*syscall.Stat_t)
	if !ok || owner.Uid != uint32(os.Getuid()) || owner.Nlink != 1 || !stat.Mode().IsRegular() || stat.Mode().Perm() != 0o600 || stat.Size() > 256*1024 {
		return nil, errors.New("desktop dataset registry must be a private bounded regular file")
	}
	bytes, err := io.ReadAll(io.LimitReader(file, 256*1024+1))
	if err != nil || len(bytes) > 256*1024 {
		return nil, errors.New("desktop dataset registry read failed")
	}
	return bytes, nil
}
