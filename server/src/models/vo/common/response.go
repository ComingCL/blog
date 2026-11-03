package common

import "nightlog/server/src/models/enums"

type Response[T any] struct {
	Code      enums.ResponseCode `json:"code"`
	Message   string             `json:"message"`
	Data      T                  `json:"data"`
	RequestID string             `json:"request_id"`
	Timestamp string             `json:"timestamp"`
}
