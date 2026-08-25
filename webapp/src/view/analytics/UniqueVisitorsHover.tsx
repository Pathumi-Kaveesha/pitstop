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

import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  Box,
  Popover,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Avatar,
  Divider,
  SxProps,
  Theme,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PeopleIcon from "@mui/icons-material/People";
import { VisitorUser } from "@slices/analyticsSlice/analytics";

interface UniqueVisitorsHoverProps {
  visitors?: VisitorUser[] | any;
  children: React.ReactNode;
  sx?: SxProps<Theme>;
}

const PAGE_SIZE = 10;

export const UniqueVisitorsHover: React.FC<UniqueVisitorsHoverProps> = ({
  visitors = [],
  children,
  sx,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [page, setPage] = useState<number>(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);

  const safeVisitors: VisitorUser[] = useMemo(() => {
    let parsedVisitors = visitors;
    if (typeof parsedVisitors === "string") {
      try {
        parsedVisitors = JSON.parse(parsedVisitors);
      } catch {
        parsedVisitors = [];
      }
    }

    if (!Array.isArray(parsedVisitors)) return [];

    return parsedVisitors
      .map((v) => {
        if (typeof v === "string") {
          return { email: v, name: v.split("@")[0] };
        }
        return { email: v?.email || "", name: v?.name || v?.email?.split("@")[0] || "" };
      })
      .filter((v) => Boolean(v.email));
  }, [visitors]);

  const open = Boolean(anchorEl);
  const totalPages = Math.ceil(safeVisitors.length / PAGE_SIZE);

  useEffect(() => {
    setPage((prevPage) => {
      if (totalPages === 0) return 0;
      return Math.min(prevPage, totalPages - 1);
    });
  }, [totalPages]);

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleForceClose = () => {
    cancelClose();
    setAnchorEl(null);
    setPage(0);
  };

  const handleOpen = (event: React.SyntheticEvent<HTMLElement>) => {
    cancelClose();
    setAnchorEl(event.currentTarget);
  };

  const handleClose = (event?: React.SyntheticEvent) => {
    if (event && "relatedTarget" in event && event.relatedTarget) {
      const target = event.relatedTarget as Node;
      if (
        triggerRef.current?.contains(target) ||
        paperRef.current?.contains(target)
      ) {
        return;
      }
    }

    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setAnchorEl(null);
      setPage(0);
    }, 200);
  };

  const handleNextPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cancelClose();
    if (page < totalPages - 1) setPage((prev) => prev + 1);
  };

  const handlePrevPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cancelClose();
    if (page > 0) setPage((prev) => prev - 1);
  };

  const currentVisitors = safeVisitors.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Box
      ref={triggerRef}
      component="span"
      tabIndex={safeVisitors.length > 0 ? 0 : -1}
      aria-haspopup="dialog"
      aria-expanded={open && safeVisitors.length > 0}
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
      onFocus={handleOpen}
      onBlur={handleClose}
      sx={{
        cursor: safeVisitors.length > 0 ? "pointer" : "default",
        display: "inline-flex",
        outline: "none",
        "&:focus-visible": {
          borderRadius: "4px",
          outline: "2px solid #0288d1",
          outlineOffset: "2px",
        },
        ...sx,
      }}
    >
      {children}

      <Popover
        open={open && safeVisitors.length > 0}
        anchorEl={anchorEl}
        onClose={handleForceClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{
          paper: {
            ref: paperRef,
            onMouseEnter: cancelClose,
            onMouseLeave: handleClose,
            onFocus: cancelClose,
            onBlur: handleClose,
            sx: {
              p: 1.5,
              width: 280,
              borderRadius: 3,
              boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
              backgroundColor: "#121212",
              color: "#ffffff",
              pointerEvents: "auto",
            },
          },
        }}
        disableRestoreFocus
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PeopleIcon sx={{ fontSize: 18, color: "primary.main" }} />
            <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: "0.85rem" }}>
              Unique Visitors ({safeVisitors.length})
            </Typography>
          </Box>
          {totalPages > 1 && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
              {page + 1} / {totalPages}
            </Typography>
          )}
        </Box>

        <Divider sx={{ borderColor: "rgba(255,255,255,0.12)", mb: 1 }} />

        {/* Set minHeight to 320px when paginated so switching pages never shrinks the popover */}
        <List
          dense
          disablePadding
          sx={{
            minHeight: totalPages > 1 ? 320 : "auto",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {currentVisitors.map((visitor, idx) => {
            const displayName = visitor.name || visitor.email.split("@")[0];
            const initial = displayName.charAt(0).toUpperCase();

            return (
              <ListItem key={`${visitor.email}-${idx}`} disablePadding sx={{ py: 0.5 }}>
                <Avatar
                  sx={{
                    width: 24,
                    height: 24,
                    fontSize: "0.75rem",
                    mr: 1.2,
                    backgroundColor: "primary.dark",
                  }}
                >
                  {initial}
                </Avatar>
                <ListItemText
                  primary={
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: "0.8rem", color: "#fff" }}>
                      {displayName}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" noWrap sx={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.6)", display: "block" }}>
                      {visitor.email}
                    </Typography>
                  }
                />
              </ListItem>
            );
          })}
        </List>

        {totalPages > 1 && (
          <>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.12)", mt: 1, mb: 0.5 }} />
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <IconButton
                size="small"
                aria-label="Previous visitors page"
                onClick={handlePrevPage}
                disabled={page === 0}
                sx={{ color: "#fff", "&.Mui-disabled": { color: "rgba(255,255,255,0.2)" } }}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>

              <Typography variant="caption" sx={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)" }}>
                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, safeVisitors.length)}
              </Typography>

              <IconButton
                size="small"
                aria-label="Next visitors page"
                onClick={handleNextPage}
                disabled={page >= totalPages - 1}
                sx={{ color: "#fff", "&.Mui-disabled": { color: "rgba(255,255,255,0.2)" } }}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Box>
          </>
        )}
      </Popover>
    </Box>
  );
};