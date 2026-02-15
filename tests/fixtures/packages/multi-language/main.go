// Package main provides the Go entry point for the multi-language test fixture.
package main

import "fmt"

// GoVersion is the Go component version.
const GoVersion = "1.0.0"

// ProcessData processes data using Go.
func ProcessData(data string) string {
	return fmt.Sprintf("Go processed: %s", data)
}

func main() {
	result := ProcessData("test")
	fmt.Println(result)
}
