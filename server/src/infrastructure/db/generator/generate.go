package generator

import (
	"gorm.io/gen"
	"nightlog/server/src/models/entity"
)

func Generate() {
	g := gen.NewGenerator(gen.Config{OutPath: "src/infrastructure/db/query", Mode: gen.WithQueryInterface})
	g.ApplyBasic(entity.User{}, entity.Post{}, entity.Draft{}, entity.Reaction{}, entity.Comment{}, entity.AuditLog{})
	g.Execute()
}
