// Package main provides the entry point for the go-only test fixture.
package main

import "fmt"

// Version is the current version of the application.
const Version = "1.0.0"

// Config holds application configuration.
type Config struct {
	Name    string
	Debug   bool
	Timeout int
}

// NewConfig creates a new Config with default values.
func NewConfig() *Config {
	return &Config{
		Name:    "go-only",
		Debug:   false,
		Timeout: 30,
	}
}

func main() {
	config := NewConfig()
	fmt.Printf("Starting %s v%s\n", config.Name, Version)
}
