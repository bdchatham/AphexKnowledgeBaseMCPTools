// Package main provides the API service - deeply nested Go package at depth 3.
package main

import "fmt"

// APIVersion is the version of the API service.
const APIVersion = "1.0.0"

// Handler handles API requests.
type Handler struct {
	Name string
}

// NewHandler creates a new Handler.
func NewHandler(name string) *Handler {
	return &Handler{Name: name}
}

// Handle processes a request.
func (h *Handler) Handle(request string) string {
	return fmt.Sprintf("API %s handled: %s", h.Name, request)
}

func main() {
	handler := NewHandler("default")
	fmt.Println(handler.Handle("test"))
}
