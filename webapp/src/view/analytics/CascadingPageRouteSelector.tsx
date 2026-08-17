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

import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Chip,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

export interface RouteOption {
  route_id: number;
  parent_id: number | null;
  route_path: string;
  label: string;
}

interface CascadingPageRouteSelectorProps {
  routes: RouteOption[];
  value: string;
  onChange: (selectedRoutePath: string) => void;
  size?: "small" | "medium";
  layout?: "horizontal" | "vertical";
}

export const CascadingPageRouteSelector: React.FC<
  CascadingPageRouteSelectorProps
> = ({ routes, value, onChange, size = "small", layout = "horizontal" }) => {
  const [card1SelectedRoute, setCard1SelectedRoute] =
    useState<RouteOption | null>(null);
  const [card2SelectedRoute, setCard2SelectedRoute] =
    useState<RouteOption | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<RouteOption[]>(
    []
  );

  useEffect(() => {
    if (!value || routes.length === 0) {
      setCard1SelectedRoute(null);
      setCard2SelectedRoute(null);
      setNavigationHistory([]);
      return;
    }

    const target = routes.find((r) => r.route_path === value);
    if (!target) return;

    const pathChain: RouteOption[] = [];
    let current: RouteOption | undefined = target;
    const visited = new Set<number>();

    while (current && !visited.has(current.route_id)) {
      visited.add(current.route_id);
      pathChain.unshift(current);
      if (current.parent_id && current.parent_id > 1) {
        current = routes.find((r) => r.route_id === current?.parent_id);
      } else {
        break;
      }
    }

    const hasChildren = routes.some((r) => r.parent_id === target.route_id);

    if (hasChildren) {
      setCard1SelectedRoute(target);
      setCard2SelectedRoute(null);
      setNavigationHistory(pathChain.slice(0, -1));
    } else {
      if (pathChain.length === 1) {
        setNavigationHistory([]);
        setCard1SelectedRoute(target);
        setCard2SelectedRoute(null);
      } else {
        setNavigationHistory(pathChain.slice(0, -2));
        setCard1SelectedRoute(pathChain[pathChain.length - 2]);
        setCard2SelectedRoute(target);
      }
    }
  }, [value, routes]);

  const card1Options = useMemo(() => {
    const currentParent =
      navigationHistory.length > 0
        ? navigationHistory[navigationHistory.length - 1]
        : null;

    if (currentParent) {
      return routes.filter((r) => r.parent_id === currentParent.route_id);
    }
    return routes.filter(
      (r) => r.parent_id === null || r.parent_id === 0 || r.parent_id === 1
    );
  }, [routes, navigationHistory]);

  const card2Options = useMemo(() => {
    if (!card1SelectedRoute) return [];
    return routes.filter((r) => r.parent_id === card1SelectedRoute.route_id);
  }, [routes, card1SelectedRoute]);

  const handleCard1Change = (routeIdStr: string) => {
    if (!routeIdStr) {
      setCard1SelectedRoute(null);
      setCard2SelectedRoute(null);
      const activeParent =
        navigationHistory.length > 0
          ? navigationHistory[navigationHistory.length - 1]
          : null;
      onChange(activeParent ? activeParent.route_path : "");
      return;
    }

    const selected = routes.find((r) => String(r.route_id) === routeIdStr);
    if (selected) {
      setCard1SelectedRoute(selected);
      setCard2SelectedRoute(null);
      onChange(selected.route_path);
    }
  };

  const handleCard2Change = (subRouteIdStr: string) => {
    if (!subRouteIdStr) {
      setCard2SelectedRoute(null);
      if (card1SelectedRoute) {
        onChange(card1SelectedRoute.route_path);
      }
      return;
    }

    const selectedSub = routes.find((r) => String(r.route_id) === subRouteIdStr);
    if (!selectedSub) return;

    onChange(selectedSub.route_path);
  };

  const handleGoBack = () => {
    if (navigationHistory.length > 0) {
      const previousCard1 = navigationHistory[navigationHistory.length - 1];
      setNavigationHistory((prev) => prev.slice(0, -1));
      setCard1SelectedRoute(previousCard1);
      setCard2SelectedRoute(null);
      onChange(previousCard1.route_path);
    }
  };

  const fieldStyle =
    layout === "vertical"
      ? { width: "100%" }
      : { width: 220, minWidth: 220, maxWidth: 220, flexShrink: 0 };

  const menuProps = {
    PaperProps: {
      style: {
        maxHeight: 320,
        maxWidth: 380,
      },
    },
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        width: layout === "vertical" ? "100%" : "auto",
      }}
    >
      {/* Drilled-in History Tag */}
      {navigationHistory.length > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1.25 }}>
          <Tooltip title="Go back to parent route level" arrow>
            <IconButton
              size="small"
              onClick={handleGoBack}
              color="primary"
              sx={{ p: 0.25 }}
            >
              <ArrowBackIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
          <Chip
            label={`In: ${navigationHistory.map((h) => h.label).join(" > ")}`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ height: 20, fontSize: "0.68rem", fontWeight: 600 }}
          />
        </Box>
      )}

      <Box
        sx={{
          display: "flex",
          flexDirection: layout === "vertical" ? "column" : "row",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        {/* Main Page Route Dropdown */}
        <FormControl size={size} sx={fieldStyle}>
          <InputLabel>Main Page Route</InputLabel>
          <Select
            value={card1SelectedRoute ? String(card1SelectedRoute.route_id) : ""}
            label="Main Page Route"
            onChange={(e) => handleCard1Change(e.target.value)}
            MenuProps={menuProps}
            renderValue={(selectedId) => {
              if (!selectedId) return <em>All Main Pages</em>;
              const selected = routes.find(
                (r) => String(r.route_id) === selectedId
              );
              const labelText = selected ? selected.label : "";
              return (
                <Tooltip title={labelText} arrow placement="top">
                  <span
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      width: "100%",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                    }}
                  >
                    {labelText}
                  </span>
                </Tooltip>
              );
            }}
            sx={{
              height: 40,
              "& .MuiSelect-select": {
                display: "flex",
                alignItems: "center",
                overflow: "hidden !important",
                textOverflow: "ellipsis !important",
                whiteSpace: "nowrap !important",
              },
            }}
          >
            <MenuItem value="">
              <em>All Main Pages</em>
            </MenuItem>
            {card1Options.map((r) => (
              <MenuItem key={r.route_id} value={String(r.route_id)}>
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: "normal",
                    wordBreak: "break-word",
                  }}
                >
                  {r.label}
                </Typography>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Sub-Page Route Dropdown */}
        {card1SelectedRoute && card2Options.length > 0 && (
          <FormControl size={size} sx={fieldStyle}>
            <InputLabel>Sub-Page Route</InputLabel>
            <Select
              value={
                card2SelectedRoute ? String(card2SelectedRoute.route_id) : ""
              }
              label="Sub-Page Route"
              onChange={(e) => handleCard2Change(e.target.value)}
              MenuProps={menuProps}
              renderValue={(selectedId) => {
                if (!selectedId)
                  return (
                    <em>All Sub-pages of {card1SelectedRoute.label}</em>
                  );
                const selected = routes.find(
                  (r) => String(r.route_id) === selectedId
                );
                const labelText = selected ? selected.label : "";
                return (
                  <Tooltip title={labelText} arrow placement="top">
                    <span
                      style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        width: "100%",
                        fontSize: "0.8125rem",
                        fontWeight: 500,
                      }}
                    >
                      {labelText}
                    </span>
                  </Tooltip>
                );
              }}
              sx={{
                height: 40,
                "& .MuiSelect-select": {
                  display: "flex",
                  alignItems: "center",
                  overflow: "hidden !important",
                  textOverflow: "ellipsis !important",
                  whiteSpace: "nowrap !important",
                },
              }}
            >
              <MenuItem value="">
                <em>All Sub-pages of {card1SelectedRoute.label}</em>
              </MenuItem>
              {card2Options.map((sub) => {
                const hasSubChildren = routes.some(
                  (r) => r.parent_id === sub.route_id
                );
                return (
                  <MenuItem key={sub.route_id} value={String(sub.route_id)}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        gap: 1,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                        }}
                      >
                        {sub.label}
                      </Typography>
                      {hasSubChildren && (
                        <Chip
                          label="Sub-pages ➔"
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{
                            height: 16,
                            fontSize: "0.625rem",
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </Box>
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        )}
      </Box>
    </Box>
  );
};