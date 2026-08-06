// Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import {
  Box,
  TextField,
  InputAdornment,
  Typography,
  Autocomplete,
  Button,
  Stack,
  Chip,
  useTheme,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import { useState, useEffect } from "react";
import { RootState, useAppDispatch, useAppSelector } from "@slices/store";
import {
  filterContent,
  getAllTags,
  searchContent,
} from "@slices/pageSlice/page";
import { TagResponse } from "@/types/types";
import { useLocation } from "react-router-dom";
import { useAnalytics } from "../../hooks/useAnalytics";
import { AnalyticsEventType } from "@utils/types";

export declare let _paq: unknown[];
if (typeof window !== "undefined") {
  (window as Window & { _paq?: unknown[] })._paq ??= [];
}

export default function Search() {
  const { trackEvent } = useAnalytics();
  const [selectedTags, setSelectedTags] = useState<TagResponse[]>([]);
  const [keywordText, setKeywordText] = useState("");
  const tagInfo = useAppSelector((state: RootState) => state.page.tagData);
  const dispatch = useAppDispatch();
  const location = useLocation();
  const theme = useTheme();

  useEffect(() => {
    dispatch(getAllTags());
  }, [dispatch]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const query = params.get("query");
    if (query) {
      setKeywordText(query);
      dispatch(searchContent({ userInput: query }));

      trackEvent(AnalyticsEventType.SEARCH, null, {
        query,
        source: "url_param_search",
      });

      if (window.config?.IS_MATOMO_ENABLED) {
        _paq.push(["trackSiteSearch", query, false, false]);
      }
    }
  }, [location.search, dispatch, trackEvent]);

  const handleSearch = () => {
    const searchText = keywordText.trim();

    // Get explicit tag names selected from the dropdown
    const explicitTagNames = selectedTags.map((tag) => tag.tagName);

    // Check if typed text matches an existing tag name (case-insensitive)
    const matchedTag = tagInfo.find(
      (t) => t.tagName.toLowerCase() === searchText.toLowerCase()
    );

    // Combine explicit tags and matched typed tag
    const allTagsToFilter = [...explicitTagNames];
    if (matchedTag && !allTagsToFilter.includes(matchedTag.tagName)) {
      allTagsToFilter.push(matchedTag.tagName);
    }

    // Label for analytics query log
    const searchTerms = [searchText, ...explicitTagNames].filter(Boolean).join(", ");

    if (searchTerms) {
      console.log("🔍 [Search.tsx] Logging search event for:", searchTerms);

      trackEvent(AnalyticsEventType.SEARCH || "SEARCH", null, {
        query: searchTerms,
        rawText: searchText,
        tagsSelected: allTagsToFilter,
        source: "global_search_bar",
      });

      if (window.config?.IS_MATOMO_ENABLED) {
        _paq.push(["trackSiteSearch", searchTerms, false, false]);
      }
    }

    // If there are tags to filter by (either dropdown selection or exact typed match)
    if (allTagsToFilter.length > 0) {
      dispatch(filterContent({ inputTags: allTagsToFilter }));
    } 
    // Otherwise, perform full-text search on title/description
    else if (searchText) {
      dispatch(searchContent({ userInput: searchText }));
    }
  };

  const isSearchDisabled = !keywordText.trim() && selectedTags.length === 0;

  const glass = {
    backdropFilter: "blur(20px)",
    backgroundColor: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: 4,
    p: 2,
    width: "100%",
    boxShadow: "0 4px 30px rgba(0,0,0,0.1)",
  } as const;

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 800,
        mx: "auto",
        px: 2,
      }}
    >
      <Stack spacing={2} sx={{ mt: 14 }}>
        <Box>
          <Box sx={glass}>
            <Typography
              variant="subtitle1"
              sx={{
                mb: 1.5,
                fontWeight: 600,
                color: theme.palette.common.white,
                fontSize: "0.85rem",
                letterSpacing: 0.5,
              }}
            >
              Global Search
            </Typography>
            <Autocomplete
              multiple
              freeSolo
              options={tagInfo}
              value={selectedTags}
              inputValue={keywordText}
              onInputChange={(_, newInputValue) => {
                setKeywordText(newInputValue);
              }}
              onChange={(_, newValue) => {
                const tagsOnly = newValue.filter(
                  (item): item is TagResponse => typeof item !== "string"
                );
                setSelectedTags(tagsOnly);
              }}
              getOptionLabel={(option) =>
                typeof option === "string" ? option : option.tagName
              }
              isOptionEqualToValue={(option, value) =>
                typeof option === "string" || typeof value === "string"
                  ? option === value
                  : option.tagName === value.tagName
              }
              renderOption={(props, option) => {
                const { key, ...otherProps } = props;

                if (typeof option === "string") {
                  return null;
                }

                return (
                  <Box
                    component="li"
                    key={key}
                    {...otherProps}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      py: 1.5,
                      px: 2,
                      borderRadius: 1,
                      transition: "all 0.2s ease",
                      "&:hover": {
                        backgroundColor: "rgba(255, 115, 0, 0.1)",
                      },
                    }}
                  >
                    <Chip
                      icon={<LocalOfferIcon sx={{ fontSize: 14 }} />}
                      label="Tag"
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        backgroundColor: theme.palette.primary.main,
                        color: "white",
                        "& .MuiChip-icon": {
                          color: "white",
                        },
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: "0.9rem",
                        color:
                          theme.palette.mode === "dark"
                            ? theme.palette.common.white
                            : theme.palette.common.black,
                      }}
                    >
                      {option.tagName}
                    </Typography>
                  </Box>
                );
              }}
              ListboxProps={{
                sx: {
                  maxHeight: 320,
                  "& .MuiAutocomplete-option": {
                    minHeight: 48,
                  },
                },
              }}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                  if (typeof option === "string") {
                    return null;
                  }

                  return (
                    <Chip
                      {...getTagProps({ index })}
                      key={index}
                      label={option.tagName}
                      icon={<LocalOfferIcon sx={{ fontSize: 14 }} />}
                      variant="outlined"
                      sx={{
                        borderColor: theme.palette.primary.dark,
                        color: theme.palette.common.white,
                        fontWeight: 500,
                        fontSize: "0.85rem",
                        height: 28,
                        backgroundColor: "transparent",
                        "& .MuiChip-icon": {
                          color: theme.palette.common.white,
                        },
                        "& .MuiChip-deleteIcon": {
                          color: theme.palette.common.white,
                          fontSize: 18,
                          "&:hover": {
                            color: theme.palette.common.white,
                          },
                        },
                      }}
                    />
                  );
                })
              }
              slotProps={{
                paper: {
                  sx: {
                    maxHeight: 320,
                  },
                },
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder="Type keywords or select tags from dropdown..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (!isSearchDisabled) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSearch();
                      } else {
                        e.preventDefault();
                      }
                    }
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(255,255,255,0.1)",
                      borderRadius: 2,
                      color: theme.palette.common.white,
                      fontSize: "0.95rem",
                      "& fieldset": {
                        borderColor: "rgba(255,255,255,0.2)",
                        borderWidth: 1.5,
                      },
                      "&:hover fieldset": {
                        borderColor: "rgba(255,255,255,0.4)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: theme.palette.primary.main,
                      },
                    },
                    "& .MuiOutlinedInput-input": {
                      padding: "10px 12px",
                      fontSize: "0.95rem",
                      "&::placeholder": {
                        color: "rgba(255,255,255,0.5)",
                        opacity: 1,
                      },
                    },
                  }}
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <InputAdornment position="start">
                          <SearchIcon
                            sx={{
                              color: "rgba(255,255,255,0.7)",
                              fontSize: 22,
                            }}
                          />
                        </InputAdornment>
                        {params.InputProps?.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            <Typography
              variant="caption"
              sx={{
                mt: 1.5,
                color: "rgba(255,255,255,0.6)",
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 400,
              }}
            >
              Type keywords or select tags from the dropdown, press Enter to
              add them, then click Search to run the search
            </Typography>
          </Box>
        </Box>

        <Box>
          <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
            <Button
              onClick={handleSearch}
              variant="contained"
              disabled={isSearchDisabled}
              sx={{
                minWidth: 200,
                px: 5,
                py: 1.5,
                fontWeight: 700,
                letterSpacing: 1,
                borderRadius: 3,
                textTransform: "uppercase",
                backdropFilter: "blur(15px)",
                backgroundColor: theme.palette.primary.main,
                color: theme.palette.common.white,
                "&:hover": { backgroundColor: "rgba(255,255,255,0.40)" },
                "&:disabled": {
                  backgroundColor: "rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.4)",
                },
              }}
            >
              SEARCH
            </Button>
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
