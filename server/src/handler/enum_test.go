package handler

import (
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"nightlog/server/src/infrastructure/db"
	"nightlog/server/src/models/entity"
	"nightlog/server/src/models/enums"
	"nightlog/server/src/models/vo/common"
	"reflect"
	"testing"
)

func TestClosedCandidateFieldsHaveNamedTypes(t *testing.T) {
	// These public contracts must expose IDE-discoverable candidates, not string.
	for name, tc := range map[string]struct {
		value any
		want  string
	}{
		"user role":      {entity.User{}.Role, "UserRole"},
		"article status": {entity.Post{}.Status, "PostStatus"},
		"comment status": {entity.Comment{}.Status, "CommentStatus"},
		"reaction kind":  {entity.Reaction{}.Kind, "ReactionKind"},
		"response code":  {common.Response[any]{}.Code, "ResponseCode"},
	} {
		t.Run(name, func(t *testing.T) {
			if got := reflect.TypeOf(tc.value).Name(); got != tc.want {
				t.Fatalf("want named enum %s, got %s", tc.want, got)
			}
		})
	}
}

func TestPageKeepsExistingWireCandidates(t *testing.T) {
	for _, query := range []string{"status=draft", "status=published", "status=trashed", "filter=unread", "filter=unreplied", "event_type=post.publish", "event_type=like.add", ""} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("GET", "/v1/api/posts?"+query, nil)
		if _, err := page(c); err != nil {
			t.Fatalf("existing candidate %s was rejected: %v", query, err)
		}
	}
}

func TestResponseCodeKeepsStringJSONContract(t *testing.T) {
	data, err := json.Marshal(common.Response[any]{Code: enums.CodeOK, Message: "success"})
	if err != nil {
		t.Fatal(err)
	}
	var wire map[string]any
	if err = json.Unmarshal(data, &wire); err != nil {
		t.Fatal(err)
	}
	if wire["code"] != "OK" {
		t.Fatalf("response code changed its wire value: %s", data)
	}
}
func TestPageRejectsUnknownCandidates(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, query := range []string{"status=unknown", "filter=unknown", "event_type=unknown"} {
		t.Run(query, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("GET", "/v1/api/admin/posts?"+query, nil)
			if _, err := page(c); !errors.Is(err, db.ErrInvalid) {
				t.Fatalf("unknown candidate accepted: %s, err=%v", query, err)
			}
		})
	}
}
