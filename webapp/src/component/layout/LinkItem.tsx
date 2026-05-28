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

import { useAppDispatch } from "@slices/store";
import { updateRouteId, updateRouterPath } from "@slices/routeSlice/route";
import { setNavigationLoading } from "@slices/commonSlice/common";
import { RouteResponse } from "@/types/types";
import React, { useEffect, useRef, useState } from "react";
import { Theme } from "@mui/material/styles";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { NavLink, LinkProps as RouterLinkProps, useLocation, matchPath, useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import { INVALID_ROUTE_ID } from "@config/constant";

const Link = React.forwardRef<HTMLAnchorElement, RouterLinkProps>((itemProps, ref) => {
  return <NavLink ref={ref} {...itemProps} />;
});

const ListItemLink = (props: ListItemLinkProps) => {
  const [open, setOpen] = useState(false);
  const [openLeft, setOpenLeft] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { primary, to, theme, isActive, children, routeId, level, label, handleSideBar} = props;
  const { pathname } = useLocation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const isTopLevel = level === 1;

  const [, setTranslateOffset] = useState(0);

  useEffect(() => {
    if (matchPath(to, pathname) !== null) {
      dispatch(updateRouteId(routeId));
      dispatch(updateRouterPath({ routeId, currentPath: to, label, children: children || [] }));
    }
  }, [pathname, to, routeId, dispatch, label, children]);

  useEffect(() => {
    if (open && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      if (rect.right > viewportWidth && level > 1) {
        setOpenLeft(true);
        setTranslateOffset(0);
      } else if (rect.right > viewportWidth && level === 1) {
        const overflowAmount = rect.right - viewportWidth + 16;
        setTranslateOffset(-overflowAmount);
        setOpenLeft(false);
      } else {
        setOpenLeft(false);
        setTranslateOffset(0);
      }
    } else {
      setTranslateOffset(0);
    }
  }, [open, level]);

  const handleMouseEnter = () => {
    if (children && children.length > 0) {
      setOpen(true);
    }
  };

  const handleMouseLeave = () => {
    setOpen(false);
    setOpenLeft(false);
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (navRef.current && !navRef.current.contains(event.target as Node)) {
      setOpen(false);
      setOpenLeft(false);
    }
  };

  useEffect(() => {
    if (open) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [open]);

  return (
  <Box
      ref={navRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        position: "relative",
        display: "inline-block",
        margin: 0,
        flexShrink: 0,
      }}
    >
      <ListItem
        component={routeId !== INVALID_ROUTE_ID ? Link : "div"}
        to={routeId !== INVALID_ROUTE_ID ? to : undefined}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          if (routeId !== INVALID_ROUTE_ID) {
            e.preventDefault();
            if (to === pathname) {
              return;
            }
            dispatch(setNavigationLoading(true));
            handleSideBar();
            setTimeout(() => {
              navigate(to);
            }, 180);
          }
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          height: "38px",
          width: "100%",
          whiteSpace: "nowrap", 
          pl: level > 2 ? level * 1.5 : 1,
          pr: routeId === INVALID_ROUTE_ID ? 3 : 0,
          borderRadius: theme.spacing(0.5),
          margin: 0,
          padding: "0 8px",
          position: "relative",
          cursor: (children && children.length > 0) || routeId !== INVALID_ROUTE_ID ? "pointer" : "default",
          "&:hover": {
            background: !isTopLevel ? "transparent" : "inherit",
          },
          ...(isTopLevel && {
            "&::after": {
              content: '""',
              position: "absolute",
              bottom: "-8px",
              left: "50%",
              transform: "translateX(-50%)",
              width: isActive ? "90%" : "0%",
              height: "5px",
              backgroundColor: theme.palette.primary.main,
              transition: "width 0.3s ease",
            },
          }),
        }}
      >
        {children && children.length > 0 && (
          <ExpandMore
            sx={{
              color: theme.palette.primary.contrastText,
              ...(isActive &&
                !isTopLevel && { color: theme.palette.primary.main }),
            }}
          />
        )}
        <ListItemText
          sx={{
            "& .MuiListItemText-primary": {
              color: theme.palette.primary.contrastText,
              ...(isActive &&
                !isTopLevel && { color: theme.palette.primary.main }),
              fontSize: "14px",
              fontWeight: 500,
              margin: 0,
              padding: "0 4px",
            },
          }}
          primary={primary}
        />
      </ListItem>

      {/* Dropdown Menu */}
      {children && children.length > 0 && (
        <Box
          ref={dropdownRef}
          sx={{
            position: "absolute",
            top: level === 1 ? "calc(100% + 8px)" : "0",
            ...(level === 1 ? {
              left: "0",
            } : openLeft ? {
              right: "100%",
              mr: "4px",
            } : {
              left: "100%",
              ml: "4px",
            }),
            display: open ? "inline-block" : "none",
            background: theme.palette.secondary.main,
            color: theme.palette.primary.contrastText,
            borderRadius: theme.spacing(0.5),
            boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.2)",
            zIndex: 1300,
            width: "auto",
            minWidth: "180px",
            padding: "8px 4px",
            whiteSpace: "nowrap",
            "&::before": level === 1 ? {
              content: '""',
              position: "absolute",
              top: "-8px",
              left: 0,
              right: 0,
              height: "8px",
            } : {},
          }}
        >
          {children.map((component) => (
            <Box
              key={component.routeId}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (component.path && component.path.includes("#")) {
                  const boxElement = e.currentTarget as HTMLElement;
                  const linkElement = boxElement.querySelector('a');
                  if (linkElement) {
                    linkElement.click();
                  }
                  return;
                }
                
                if ((!component.children || component.children.length === 0) && 
                    component.path && 
                    component.path !== "#") {
                  if (component.path === pathname) {
                    return;
                  }
                  dispatch(setNavigationLoading(true));
                  handleSideBar();
                  setTimeout(() => {
                    navigate(component.path);
                  }, 180);
                }
              }}
              sx={{
                display: "block",
                width: "100%",
                borderRadius: "8px",
                transition: "background 0.2s ease",
                cursor: "pointer",
                "&:hover": {
                  background: theme.palette.secondary.dark,
                },
                "& a": {
                  cursor: "pointer",
                  textDecoration: "none",
                },
                "& .MuiListItem-root": {
                  width: "100%",
                  margin: 0,
                },
                color: theme.palette.primary.contrastText,
              }}
            >
              <ListItemLink
                routeId={component.routeId}
                theme={props.theme}
                to={component.path}
                label={component.menuItem}
                primary={component.menuItem}
                handleSideBar={handleSideBar}
                isActive={matchPath(component.path, pathname) !== null}
                children={component.children}
                level={level + 1}
                isRouteVisible={0}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default ListItemLink;

interface ListItemLinkProps {
  routeId: number;
  primary: string;
  to: string;
  label: string;
  isActive: boolean;
  theme: Theme;
  children?: RouteResponse[];
  level: number;
  handleSideBar: () => void;
  isRouteVisible: number;
}
