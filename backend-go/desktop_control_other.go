//go:build !unix

package main

import (
	"errors"
	"io"
)

// Windows desktop delivery is deferred (#163); it will need handle-based pipes.
func openDesktopControlPipes() (io.Reader, io.Writer, error) {
	return nil, nil, errors.New("desktop control mode is not supported on this platform yet")
}
