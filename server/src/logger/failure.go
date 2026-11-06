package logger

import (
	"errors"
	"fmt"
	"regexp"
)

var sqlStatePattern = regexp.MustCompile(`^[0-9A-Z]{5}$`)

// FailureFields deliberately excludes Error(), database Detail/Hint, SQL and
// network addresses. Type and SQLSTATE identify a failure without leaking data.
func FailureFields(err error) []any {
	fields := []any{"error_type", fmt.Sprintf("%T", err)}
	cause := err
	for i := 0; i < 16 && errors.Unwrap(cause) != nil; i++ {
		cause = errors.Unwrap(cause)
	}
	fields = append(fields, "error_cause_type", fmt.Sprintf("%T", cause))
	var postgres interface{ SQLState() string }
	if errors.As(err, &postgres) && sqlStatePattern.MatchString(postgres.SQLState()) {
		fields = append(fields, "sqlstate", postgres.SQLState())
	}
	return fields
}
