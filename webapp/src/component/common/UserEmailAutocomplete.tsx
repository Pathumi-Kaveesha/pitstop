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

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
  Avatar,
  CircularProgress,
  Checkbox,
  Tooltip,
} from "@mui/material";
import { useAppDispatch } from "@slices/store";
import { fetchMentionSuggestions } from "@slices/pageSlice/page";
import { EmployeeSuggestion } from "@/types/types";

interface UserEmailAutocompleteProps {
  value: string | string[];
  onChange: (email: any) => void;
  label?: string;
  placeholder?: string;
  size?: "small" | "medium";
  fullWidth?: boolean;
  disabled?: boolean;
  multiple?: boolean;
}

export const UserEmailAutocomplete: React.FC<UserEmailAutocompleteProps> = ({
  value,
  onChange,
  label = "User Email",
  placeholder = "Type a name...",
  size = "small",
  fullWidth = true,
  disabled = false,
  multiple = false,
}) => {
  const dispatch = useAppDispatch();
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<EmployeeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleInputChange = (newInputValue: string) => {
    setInputValue(newInputValue);

    if (!multiple) {
      onChange(newInputValue);
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (newInputValue.trim().length >= 2) {
      setLoading(true);
      debounceTimerRef.current = setTimeout(() => {
        dispatch(fetchMentionSuggestions({ searchQuery: newInputValue }))
          .then((result) => {
            const payload = result.payload as EmployeeSuggestion[] | undefined;
            setOptions(payload || []);
          })
          .catch(() => {
            setOptions([]);
          })
          .finally(() => {
            setLoading(false);
          });
      }, 300);
    } else {
      setOptions([]);
      setLoading(false);
    }
  };

  // Currently selected emails as array
  const selectedList = useMemo(() => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  }, [value]);

  // Merge selected emails into dropdown options so they stay visible for easy unchecking
  const combinedOptions = useMemo(() => {
    const map = new Map<string, EmployeeSuggestion>();

    // 1. Add selected emails (construct fallback if search suggestion object not present)
    selectedList.forEach((email) => {
      const found = options.find((o) => o.workEmail === email);
      if (found) {
        map.set(email, found);
      } else {
        map.set(email, {
          workEmail: email,
          firstName: email.split("@")[0],
          lastName: "",
        } as EmployeeSuggestion);
      }
    });

    // 2. Add search result suggestions
    options.forEach((opt) => {
      if (opt.workEmail && !map.has(opt.workEmail)) {
        map.set(opt.workEmail, opt);
      }
    });

    return Array.from(map.values());
  }, [selectedList, options]);

  return (
    <Autocomplete
      multiple={multiple as any}
      disabled={disabled}
      disableCloseOnSelect={multiple}
      freeSolo
      size={size}
      fullWidth={fullWidth}
      options={combinedOptions}
      loading={loading}
      value={multiple ? (selectedList as any) : ((value as string) || "")}
      inputValue={inputValue}
      onInputChange={(_event, newInputValue) => handleInputChange(newInputValue)}
      onChange={(_event, newValue) => {
        if (multiple) {
          const selectedEmails = (Array.isArray(newValue) ? newValue : [])
            .map((item) => {
              if (typeof item === "string") return item.trim();
              return item?.workEmail || "";
            })
            .filter(Boolean);
          onChange(selectedEmails);
        } else {
          if (typeof newValue === "string") {
            onChange(newValue);
          } else if (newValue && !Array.isArray(newValue) && newValue.workEmail) {
            onChange(newValue.workEmail);
          } else {
            onChange("");
          }
        }
      }}
      getOptionLabel={(option) => {
        if (typeof option === "string") return option;
        return option.workEmail || "";
      }}
      isOptionEqualToValue={(option, val) => {
        const optionEmail = typeof option === "string" ? option : option.workEmail;
        const valEmail = typeof val === "string" ? val : val.workEmail;
        return optionEmail === valEmail;
      }}
      renderTags={() => null} // Suppresses default wrapped chips
      renderOption={(props, option) => {
        const { key, ...optionProps } = props;
        const isChecked = selectedList.includes(option.workEmail);

        return (
          <Box
            key={key || option.workEmail}
            component="li"
            {...optionProps}
            sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.75, px: 1.5 }}
          >
            {multiple && (
              <Checkbox
                size="small"
                checked={isChecked}
                sx={{ p: 0.25, mr: 0.5 }}
              />
            )}
            <Avatar
              src={option.employeeThumbnail}
              sx={{ width: 24, height: 24, fontSize: "0.75rem", flexShrink: 0 }}
            >
              {option.firstName?.charAt(0)}
            </Avatar>
            <Box sx={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <Typography variant="body2" fontWeight={600} lineHeight={1.2} noWrap>
                {option.firstName} {option.lastName}
              </Typography>
              <Typography variant="caption" color="text.secondary" lineHeight={1.2} noWrap>
                {option.workEmail} {option.department ? `• ${option.department}` : ""}
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => {
        const showSummary = multiple && selectedList.length > 0 && !inputValue;

        return (
          <TextField
            {...params}
            label={label}
            placeholder={selectedList.length > 0 ? "" : placeholder}
            InputLabelProps={{ shrink: true }}
            sx={{
              "& .MuiOutlinedInput-root": {
                height: 40,
                alignItems: "center",
                pt: "0 !important",
                pb: "0 !important",
                flexWrap: "nowrap !important",
                overflow: "hidden !important",
              },
              "& .MuiInputBase-input": {
                fontSize: "0.8125rem",
              },
            }}
            InputProps={{
              ...params.InputProps,
              startAdornment: showSummary ? (
                <Tooltip title={selectedList.join(", ")} arrow placement="top">
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "text.primary",
                      pointerEvents: "none",
                      pr: 1,
                    }}
                  >
                    {selectedList.length === 1
                      ? selectedList[0]
                      : `${selectedList.length} Users Selected`}
                  </Typography>
                </Tooltip>
              ) : (
                params.InputProps.startAdornment
              ),
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={16} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        );
      }}
    />
  );
};