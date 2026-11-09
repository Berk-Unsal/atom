//go:build !unix

package main

import "errors"

func readDesktopRegistryFile(string) ([]byte, error) {
	return nil, errors.New("desktop dataset registry is unsupported on this platform")
}
