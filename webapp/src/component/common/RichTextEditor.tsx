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

import { Box, Typography, useTheme } from "@mui/material";
import ReactQuill, { Quill } from "react-quill";
import "react-quill/dist/quill.snow.css";
import React, { useMemo } from "react";

const Size = Quill.import("formats/size");
Size.whitelist = ["14px", "16px", "18px", "20px"];
Quill.register(Size, true);

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  height?: string;
  showSizeSelector?: boolean;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = "Enter text...",
  disabled = false,
  height = "120px",
  showSizeSelector = true,
}) => {
  const theme = useTheme();

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          ...(showSizeSelector ? [[{ size: ["14px", "16px", "18px", "20px"] }]] : []),
          ["bold", "italic", "underline", "strike"],
          [{ color: [] }, { background: [] }],
          [{ align: [] }], 
          [{ script: "sub" }, { script: "super" }],
          [{ list: "ordered" }, { list: "bullet" }],
          ["blockquote"],
        ],
      },
    }),
    [showSizeSelector],
  );

  const formats = [
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "align", 
    "script",
    "list",
    "blockquote",
  ];

  return (
    <Box>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          mb: 1,
          color: theme.palette.text.secondary,
        }}
      >
        Tip: Select text to format specific words or phrases
      </Typography>
      <Box
        sx={{
          "& .quill": {
            backgroundColor: theme.palette.background.paper,
            borderRadius: 1,
          },
          "& .ql-toolbar": {
            backgroundColor: theme.palette.mode === "dark" ? "#1e1e1e" : "#f5f5f5",
            borderColor: theme.palette.divider,
            borderRadius: "4px 4px 0 0",
            padding: "12px",
          },
          "& .ql-container": {
            borderColor: theme.palette.divider,
            borderRadius: "0 0 4px 4px",
            minHeight: height,
            fontSize: "16px",
            fontFamily: theme.typography.fontFamily,
          },
          "& .ql-editor": {
            minHeight: height,
            color: theme.palette.text.primary,
            lineHeight: 1.6,
            padding: "16px",
          },
          "& .ql-editor.ql-blank::before": {
            color: theme.palette.text.disabled,
            fontStyle: "normal",
            left: "16px",
          },
          // Style for formatted text
          "& .ql-editor strong": {
            fontWeight: "bold !important",
          },
          "& .ql-editor em": {
            fontStyle: "italic !important",
          },
          "& .ql-editor u": {
            textDecoration: "underline !important",
          },
          "& .ql-editor .ql-size-14px": {
            fontSize: "14px !important",
          },
          "& .ql-editor .ql-size-16px": {
            fontSize: "16px !important",
          },
          "& .ql-editor .ql-size-18px": {
            fontSize: "18px !important",
          },
          "& .ql-editor .ql-size-20px": {
            fontSize: "20px !important",
          },
          // Color picker styling
          "& .ql-picker-label": {
            cursor: "pointer",
          },
          "& .ql-picker-options": {
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
          },
          // Toolbar button and icon colors for dark mode
          "& .ql-toolbar .ql-stroke": {
            stroke: theme.palette.mode === "dark" ? theme.palette.common.white : theme.palette.common.black,
          },
          "& .ql-toolbar .ql-fill": {
            fill: theme.palette.mode === "dark" ? theme.palette.common.white : theme.palette.common.black,
          },
          "& .ql-toolbar .ql-picker-label": {
            color: theme.palette.mode === "dark" ? theme.palette.common.white : theme.palette.common.black,
          },
          // Toolbar button hover
          "& .ql-toolbar button:hover": {
            color: theme.palette.primary.main,
          },
          "& .ql-toolbar button.ql-active": {
            color: theme.palette.primary.main,
          },
          "& .ql-size .ql-picker-label": {
            "&::before": {
              content: '"Size"',
            },
          },
          "& .ql-size .ql-picker-label[data-value]::before": {
            content: 'attr(data-value)',
          },
          // Custom size picker labels
          "& .ql-size .ql-picker-item[data-value='14px']::before": {
            content: '"14px"',
          },
          "& .ql-size .ql-picker-item[data-value='16px']::before": {
            content: '"16px"',
          },
          "& .ql-size .ql-picker-item[data-value='18px']::before": {
            content: '"18px"',
          },
          "& .ql-size .ql-picker-item[data-value='20px']::before": {
            content: '"20px"',
          },
        }}
      >
        <ReactQuill
          value={value}
          onChange={onChange}
          modules={modules}
          formats={formats}
          placeholder={placeholder}
          readOnly={disabled}
          theme="snow"
        />
      </Box>
    </Box>
  );
};

export default RichTextEditor;