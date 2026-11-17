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
import React, { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { alpha, Theme } from "@mui/material/styles";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { NavLink, LinkProps as RouterLinkProps, useLocation, matchPath, useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import { INVALID_ROUTE_ID } from "@config/constant";
import { MenuContainerContext } from "@components/layout/MenuContainerContext";

// A menu under its item is not made smaller than this while there is room for it; below this it opens above the item
const MIN_MENU_HEIGHT = 120;
// The smallest height a menu is ever given, so it never collapses on a very small screen
const MIN_ROOM = 40;

const Link = React.forwardRef<HTMLAnchorElement, RouterLinkProps>((itemProps, ref) => {
  return <NavLink ref={ref} {...itemProps} />;
});

const ListItemLink = (props: ListItemLinkProps) => {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ top: 0, left: 0, maxHeight: 0, openLeft: false, above: false });
  const navRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { primary, to, theme, isActive, children, routeId, level, label, handleSideBar } = props;
  const { pathname } = useLocation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const menuContainer = useContext(MenuContainerContext);
  // No container given: the menu goes on the page itself. A container that is not ready yet means no menu for now.
  const menuParent = menuContainer === undefined ? document.body : menuContainer;

  const isTopLevel = level === 1;
  const isCompact = isTopLevel && window.config?.IS_PITSTOP_APP == false;

  useEffect(() => {
    if (matchPath(to, pathname) !== null) {
      dispatch(updateRouteId(routeId));
      dispatch(updateRouterPath({ routeId, currentPath: to, label, children: children || [] }));
    }
  }, [pathname, to, routeId, dispatch, label, children]);

  // The menu is drawn on the page itself, placed from its item, so a long list scrolls inside the screen
  // and a side menu is never cut off by the list it opens from.
  const placeDropdown = useCallback(() => {
    const anchor = navRef.current;
    const wrapper = dropdownRef.current;
    const menu = menuRef.current;
    if (!anchor || !wrapper || !menu) {
      return;
    }
    const edge = 16;
    const bridge = level === 1 ? 8 : 0;
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const width = wrapper.offsetWidth;

    let left: number;
    let openLeft = false;
    if (level === 1) {
      left = Math.max(edge, Math.min(rect.left, viewportWidth - width - edge));
    } else {
      openLeft = rect.right + width + edge > viewportWidth && rect.left - width >= edge;
      left = Math.max(edge, Math.min(openLeft ? rect.left - width : rect.right, viewportWidth - width - edge));
    }

    let top: number;
    let maxHeight: number;
    let above = false;
    if (level === 1) {
      const roomBelow = viewportHeight - edge - rect.bottom - bridge;
      const roomAbove = rect.top - edge - bridge;
      // With little room under the item the menu opens above it, when there is more room there
      above = roomBelow < MIN_MENU_HEIGHT && roomAbove > roomBelow;
      maxHeight = Math.max(MIN_ROOM, above ? roomAbove : roomBelow);
      top = above ? rect.top - bridge - Math.min(menu.scrollHeight, maxHeight) : rect.bottom;
    } else {
      const room = viewportHeight - 2 * edge;
      top = Math.max(edge, Math.min(rect.top, viewportHeight - edge - Math.min(menu.scrollHeight, room)));
      maxHeight = viewportHeight - edge - top;
    }

    setPlacement((prev) =>
      Math.abs(prev.top - top) < 0.5 &&
      Math.abs(prev.left - left) < 0.5 &&
      Math.abs(prev.maxHeight - maxHeight) < 0.5 &&
      prev.openLeft === openLeft &&
      prev.above === above
        ? prev
        : { top, left, maxHeight, openLeft, above }
    );
  }, [level]);

  useLayoutEffect(() => {
    if (open) {
      placeDropdown();
    }
  }, [open, placeDropdown]);

  useEffect(() => {
    if (!open) {
      return;
    }
    window.addEventListener("resize", placeDropdown);
    window.addEventListener("scroll", placeDropdown, true);
    return () => {
      window.removeEventListener("resize", placeDropdown);
      window.removeEventListener("scroll", placeDropdown, true);
    };
  }, [open, placeDropdown]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (children && children.length > 0) {
      setOpen(true);
    }
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 150);
  };

  const handleClickOutside = (event: MouseEvent) => {
    // A menu is drawn outside its item, so a click inside any menu counts as inside
    const insideMenu = (event.target as Element).closest?.("[data-nav-dropdown]");
    if (navRef.current && !navRef.current.contains(event.target as Node) && !insideMenu) {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (open) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

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
          padding: isCompact ? "0 3px" : "0 8px",
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
              padding: isCompact ? "0 1px" : "0 4px",
            },
          }}
          primary={primary}
        />
      </ListItem>

      {/* Dropdown Menu */}
      {children &&
        children.length > 0 &&
        menuParent &&
        createPortal(
          <Box
            ref={dropdownRef}
            data-nav-dropdown=""
            sx={{
              position: "fixed",
              top: placement.top,
              left: placement.left,
              display: open ? "block" : "none",
              // Above the header and the side drawers, below dialogs, as before; a side menu above the one it opens from
              zIndex: 1250 + level,
              width: "max-content",
              // Empty space between the item and the menu, so the pointer can cross it without closing the menu
              ...(level === 1 ? (placement.above ? { pb: "8px" } : { pt: "8px" }) : placement.openLeft ? { pr: "4px" } : { pl: "4px" }),
            }}
          >
            <Box
              ref={menuRef}
              sx={{
                background: theme.palette.secondary.main,
                color: theme.palette.primary.contrastText,
                borderRadius: theme.spacing(0.5),
                boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.2)",
                minWidth: "180px",
                padding: "8px 4px",
                boxSizing: "border-box",
                whiteSpace: "nowrap",
                maxHeight: placement.maxHeight || undefined,
                overflowY: "auto",
                overflowX: "hidden",
                overscrollBehavior: "contain",
                // A scrollbar that stays visible, so it is clear the list goes on
                "&::-webkit-scrollbar": { width: "8px" },
                "&::-webkit-scrollbar-thumb": {
                  background: alpha(theme.palette.primary.contrastText, 0.4),
                  borderRadius: "4px",
                },
                "&::-webkit-scrollbar-track": { background: "transparent" },
                "@supports not selector(::-webkit-scrollbar)": {
                  scrollbarWidth: "thin",
                  scrollbarColor: `${alpha(theme.palette.primary.contrastText, 0.4)} transparent`,
                },
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
                      const linkElement = boxElement.querySelector("a");
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
          </Box>,
          menuParent
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
