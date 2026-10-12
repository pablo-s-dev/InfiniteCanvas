import { useState } from "react";

export const useHomeQueryParams = () => {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState("1");
  const [tags, setTags] = useState("");
  const [sort, setSort] = useState("updated_desc");

  return { query, setQuery, page, setPage, tags, setTags, sort, setSort };
};
