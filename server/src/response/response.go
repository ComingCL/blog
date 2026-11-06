package response

import (
	"errors"
	"github.com/gin-gonic/gin"
	"log/slog"
	"net/http"
	"nightlog/server/src/audit"
	"nightlog/server/src/infrastructure/db"
	"nightlog/server/src/logger"
	"nightlog/server/src/models/enums"
	"nightlog/server/src/models/vo/common"
	"nightlog/server/src/service"
	"time"
)

func Send(c *gin.Context, status int, code enums.ResponseCode, message string, data any) {
	c.JSON(status, common.Response[any]{Code: code, Message: message, Data: data, RequestID: c.GetString("request_id"), Timestamp: time.Now().UTC().Format(time.RFC3339Nano)})
}
func OK(c *gin.Context, data any)      { Send(c, 200, enums.CodeOK, "success", data) }
func Created(c *gin.Context, data any) { Send(c, 201, enums.CodeOK, "success", data) }
func Fail(c *gin.Context, status int, code enums.ResponseCode, message string) {
	Send(c, status, code, message, nil)
	c.Abort()
}
func Error(c *gin.Context, e error) {
	status, code, message := http.StatusInternalServerError, enums.CodeInternalError, "服务暂时不可用，请稍后重试"
	switch {
	case errors.Is(e, db.ErrNotFound):
		status, code, message = 404, enums.CodeNotFound, "内容不存在或暂不可用"
	case errors.Is(e, db.ErrConflict):
		status, code, message = 409, enums.CodeVersionConflict, "记录已存在或已更新，请刷新后重试"
	case errors.Is(e, db.ErrForbidden):
		status, code, message = 403, enums.CodeForbidden, "没有操作权限"
	case errors.Is(e, db.ErrInvalid):
		status, code, message = 400, enums.CodeInvalidInput, "请检查输入内容"
	case errors.Is(e, service.ErrUnauthorized):
		status, code, message = 401, enums.CodeUnauthorized, "请登录，或检查用户名和密码"
	default:
		meta := audit.From(c.Request.Context())
		fields := []any{"request_id", c.GetString("request_id"), "route", meta.Route, "method", meta.Method,
			"client_ip", meta.ClientIP, "user_id", meta.ActorID, "username", meta.Username}
		slog.ErrorContext(c.Request.Context(), "request_failed", append(fields, logger.FailureFields(e)...)...)
	}
	Fail(c, status, code, message)
}
