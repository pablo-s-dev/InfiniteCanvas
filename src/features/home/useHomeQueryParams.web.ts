import { useQueryState } from "nuqs";

export const useHomeQueryParams = () => {
  const [query, setQuery] = useQueryState("q", { defaultValue: "" });
  const [page, setPage] = useQueryState("page", { defaultValue: "1" });
  const [tags, setTags] = useQueryState("tags", { defaultValue: "" });
  const [sort, setSort] = useQueryState("sort", { defaultValue: "updated_desc" });

  return { query, setQuery, page, setPage, tags, setTags, sort, setSort };
};
