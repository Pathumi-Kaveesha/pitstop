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

import React, { useState, useEffect, useRef } from "react";
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
  Avatar,
  CircularProgress,
} from "@mui/material";
import { useAppDispatch } from "@slices/store";
import { fetchMentionSuggestions } from "@slices/pageSlice/page";
import { EmployeeSuggestion } from "@/types/types";

interface UserEmailAutocompleteProps {
  value: string;
  onChange: (email: string) => void;
  label?: string;
  placeholder?: string;
  size?: "small" | "medium";
  fullWidth?: boolean;
}

export const UserEmailAutocomplete: React.FC<UserEmailAutocompleteProps> = ({
  value,
  onChange,
  label = "User Email",
  placeholder = "e.g. user@wso2.com",
  size = "small",
  fullWidth = true,
}) => {
  const dispatch = useAppDispatch();
  const [inputValue, setInputValue] = useState(value);
  const [options, setOptions] = useState<EmployeeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync internal input value if external value changes (e.g. on Reset)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleInputChange = (newInputValue: string) => {
    setInputValue(newInputValue);
    onChange(newInputValue); // Allows manual typing of any email address

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

  return (
    <Autocomplete
      freeSolo
      size={size}
      fullWidth={fullWidth}
      options={options}
      loading={loading}
      inputValue={inputValue}
      onInputChange={(_event, newInputValue) => handleInputChange(newInputValue)}
      onChange={(_event, newValue) => {
        if (typeof newValue === "string") {
          onChange(newValue);
        } else if (newValue && newValue.workEmail) {
          onChange(newValue.workEmail);
        } else {
          onChange("");
        }
      }}
      getOptionLabel={(option) => {
        if (typeof option === "string") {
          return option;
        }
        return option.workEmail || "";
      }}
      isOptionEqualToValue={(option, val) => {
        const optionEmail = typeof option === "string" ? option : option.workEmail;
        const valEmail = typeof val === "string" ? val : val.workEmail;
        return optionEmail === valEmail;
      }}
      renderOption={(props, option) => {
        const { key, ...optionProps } = props;
        return (
          <Box
            key={key || option.workEmail}
            component="li"
            {...optionProps}
            sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}
          >
            <Avatar
              src={option.employeeThumbnail}
              sx={{ width: 28, height: 28, fontSize: "0.8rem" }}
            >
              {option.firstName?.charAt(0)}
            </Avatar>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              <Typography variant="body2" fontWeight={600} lineHeight={1.2}>
                {option.firstName} {option.lastName}
              </Typography>
              <Typography variant="caption" color="text.secondary" lineHeight={1.2}>
                {option.workEmail} {option.department ? `• ${option.department}` : ""}
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};