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

import React from "react";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { ExportSection } from "./analyticsHelpers";

const VISITOR_COLUMNS = 3;

const blockSx = {
  p: 3,
  borderRadius: 4,
  border: 1,
  borderColor: "divider",
  backgroundColor: "background.paper",
};

export const ExportMarker: React.FC<{ n: number }> = ({ n }) => {
  const theme = useTheme();
  return (
    // Hidden on the live page; the export copy switches it on
    <Box
      data-export-only="block"
      sx={{
        display: "none",
        position: "absolute",
        right: 10,
        bottom: 6,
        zIndex: 3,
        px: 0.75,
        borderRadius: 1,
        fontSize: "0.7rem",
        fontWeight: 700,
        lineHeight: 1.6,
        color: theme.palette.primary.main,
        backgroundColor: alpha(theme.palette.primary.main, 0.12),
      }}
    >
      [{n}]
    </Box>
  );
};

interface ExportHeaderProps {
  exporterName: string;
  exporterEmail: string;
  exportedAtLabel: string;
  filterLines: string[];
}

export const ExportHeader: React.FC<ExportHeaderProps> = ({
  exporterName,
  exporterEmail,
  exportedAtLabel,
  filterLines,
}) => (
  <Paper elevation={0} data-export-only="block" sx={{ ...blockSx, mt: 4, display: "none" }}>
    <Typography variant="h6" fontWeight={700}>
      Pitstop Analytics – Snapshot
    </Typography>
    <Typography variant="body2" sx={{ mt: 0.5 }}>
      Exported by {exporterName}
      {exporterEmail && exporterEmail !== exporterName ? ` (${exporterEmail})` : ""} on {exportedAtLabel}
    </Typography>
    <Typography variant="body2" color="error" fontWeight={600} sx={{ mt: 1 }}>
      Internal use only. This file contains names and email addresses of WSO2 staff. Do not share it outside WSO2.
    </Typography>
    <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1.5 }}>
      Filters applied to the whole dashboard
    </Typography>
    {filterLines.map((line) => (
      <Typography key={line} variant="body2" sx={{ wordBreak: "break-word" }}>
        {line}
      </Typography>
    ))}
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
      Markers like [1] point to the matching entry in the Details section at the end of this file.
    </Typography>
  </Paper>
);

export const ExportDetails: React.FC<{ sections: ExportSection[] }> = ({ sections }) => {
  const theme = useTheme();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 4 }}>
      <Paper elevation={0} sx={blockSx} data-export-block="true">
        <Typography variant="h5" fontWeight={700}>
          Details
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Information that the dashboard shows only on hover or click, written out in full.
        </Typography>
      </Paper>

      {sections.map((section) => (
        <Paper key={section.marker} elevation={0} sx={blockSx} data-export-block="true">
          <Typography variant="h6" fontWeight={700} data-export-row="true">
            [{section.marker}] {section.title}
          </Typography>

          {section.lines?.map((line, idx) => (
            <Typography
              key={`line-${idx}`}
              variant="body2"
              sx={{ mt: 0.75, wordBreak: "break-word" }}
              data-export-row="true"
            >
              {line}
            </Typography>
          ))}

          {section.cardFilters && section.cardFilters.length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={700} data-export-row="true">
                This card uses its own filters
              </Typography>
              {section.cardFilters.map((line) => (
                <Typography key={line} variant="body2" sx={{ wordBreak: "break-word" }} data-export-row="true">
                  {line}
                </Typography>
              ))}
            </Box>
          )}

          {section.visitorGroups?.map((group, groupIdx) => {
            const rows: (typeof group.visitors)[] = [];
            for (let i = 0; i < group.visitors.length; i += VISITOR_COLUMNS) {
              rows.push(group.visitors.slice(i, i + VISITOR_COLUMNS));
            }
            return (
              <Box key={`group-${groupIdx}`} sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ wordBreak: "break-word" }} data-export-row="true">
                  {group.label}
                </Typography>
                {rows.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" data-export-row="true">
                    No visitors
                  </Typography>
                ) : (
                  rows.map((row, rowIdx) => (
                    <Box
                      key={`row-${rowIdx}`}
                      sx={{ display: "grid", gridTemplateColumns: `repeat(${VISITOR_COLUMNS}, 1fr)`, gap: 2, py: 0.5 }}
                      data-export-row="true"
                    >
                      {row.map((visitor, visitorIdx) => (
                        <Box key={`${visitor.email}-${visitorIdx}`} sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} sx={{ wordBreak: "break-word" }}>
                            {visitor.name || visitor.email}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                            {visitor.email}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  ))
                )}
              </Box>
            );
          })}

          {section.table && (
            <Table size="small" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow data-export-row="true">
                  {section.table.columns.map((column) => (
                    <TableCell
                      key={column}
                      sx={{ fontWeight: 700, backgroundColor: alpha(theme.palette.primary.main, 0.03) }}
                    >
                      {column}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {section.table.rows.map((row, rowIdx) => (
                  <TableRow key={`trow-${rowIdx}`} data-export-row="true">
                    {row.map((cell, cellIdx) => (
                      <TableCell key={`cell-${cellIdx}`}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      ))}
    </Box>
  );
};
