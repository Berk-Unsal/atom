//go:build unix

package main

import (
	"fmt"
	"io"
	"os"
	"syscall"
)

// The desktop host passes the control input as fd 3 and the control output as
// fd 4 (os/exec ExtraFiles order). Mark both close-on-exec so they never leak
// into processes this server might start.
const (
	desktopControlInputFD  = 3
	desktopControlOutputFD = 4
)

func openDesktopControlPipes() (io.Reader, io.Writer, error) {
	input := os.NewFile(desktopControlInputFD, "desktop-control-input")
	output := os.NewFile(desktopControlOutputFD, "desktop-control-output")
	for _, file := range []*os.File{input, output} {
		if file == nil {
			return nil, nil, fmt.Errorf("desktop control descriptors are missing")
		}
		if _, err := file.Stat(); err != nil {
			return nil, nil, fmt.Errorf("desktop control descriptor %s: %w", file.Name(), err)
		}
		syscall.CloseOnExec(int(file.Fd()))
	}
	return input, output, nil
}
