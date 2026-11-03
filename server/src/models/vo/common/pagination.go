package common

type Pagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	Total      int64 `json:"total"`
	TotalPages int64 `json:"total_pages"`
	HasNext    bool  `json:"has_next"`
}
type PageData[T any] struct {
	List       []T        `json:"list"`
	Pagination Pagination `json:"pagination"`
}

func Page[T any](list []T, total int64, page, size int) PageData[T] {
	if list == nil {
		list = []T{}
	}
	pages := (total + int64(size) - 1) / int64(size)
	return PageData[T]{List: list, Pagination: Pagination{page, size, total, pages, int64(page) < pages}}
}
