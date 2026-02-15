// Package main provides utility functions for the go-only test fixture.
package main

import "strings"

// FormatName formats a name by trimming whitespace and converting to title case.
func FormatName(name string) string {
	return strings.TrimSpace(name)
}

// ValidateInput checks if the input string is non-empty.
func ValidateInput(input string) bool {
	return len(strings.TrimSpace(input)) > 0
}

// MaxInt returns the larger of two integers.
func MaxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
