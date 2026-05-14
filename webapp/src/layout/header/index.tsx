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

import DarkModeIcon from "@mui/icons-material/DarkMode";
import DashboardIcon from "@mui/icons-material/Dashboard";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import LightModeIcon from "@mui/icons-material/LightMode";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SearchIcon from "@mui/icons-material/Search";
import {
  Avatar,
  Box,
  CssBaseline,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import MuiAppBar, { AppBarProps as MuiAppBarProps } from "@mui/material/AppBar";
import Fab from "@mui/material/Fab";
import IconButton from "@mui/material/IconButton";
import { Theme, alpha, styled, useTheme } from "@mui/material/styles";
import { useSelector } from "react-redux";
import { matchPath, useLocation, useNavigate } from "react-router-dom";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import wso2Logo from "@assets/images/wso2-logo.png";
import wso2LogoWhite from "@assets/images/wso2-logo-white.png";
import AdminPanelSideBar from "@components/adminPanel/AdminDrawer";
import ListItemLink from "@components/layout/LinkItem";
import {
  INVALID_ROUTE_ID,
  ROUTE_ID_ADMIN_EDIT_MENU,
  ROUTE_ID_ADMIN_PANEL,
  ROUTE_ID_ADMIN_REPORT,
  ROUTE_ID_HOME,
  ROUTE_ID_MORE,
  ROUTE_ID_MY_BOARD,
  ROUTE_ID_QUIZ_ADMIN,
} from "@config/constant";
import { useAppAuthContext } from "@context/AuthContext";
import { selectUserInfo } from "@slices/authSlice";
import { RootState, useAppSelector, useAppDispatch } from "@slices/store";
import { setNavigationLoading } from "@slices/commonSlice/common";
import { Role } from "@utils/types";

import { ColorModeContext } from "../../App";
import { RouteResponse } from "@/types/types";
import Sidebar from "../sidebar";

const StyledAppBar = styled(MuiAppBar)<MuiAppBarProps>(({ theme }) => ({
  position: "absolute",
  top: "16px",
  left: "16px",
  right: "16px",
  width: "calc(100% - 32px)",
  zIndex: theme.zIndex.drawer + 1,
  background: theme.palette.mode === "dark" ? "rgba(18, 18, 18, 0.7)" : "rgba(255, 255, 255, 0.7)",

  backdropFilter: "blur(30px) saturate(180%)",
  WebkitBackdropFilter: "blur(30px) saturate(180%)",

  border: `1px solid ${
    theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.8)"
  }`,

  borderRadius: "50px",

  boxShadow:
    theme.palette.mode === "dark"
      ? "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
      : "0 8px 32px rgba(31, 38, 135, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.8)",

  transition: theme.transitions.create(
    ["background-color", "transform", "backdrop-filter", "box-shadow"],
    {
      duration: theme.transitions.duration.standard,
    },
  ),
}));

const filterPubliclyVisibleRoutes = (routes: RouteResponse[]): RouteResponse[] => {
  const visibleRoutes: RouteResponse[] = [];

  for (const route of routes) {
    if (route.isRouteVisible === true) {
      const children = route.children ? filterPubliclyVisibleRoutes(route.children) : [];
      visibleRoutes.push({
        ...route,
        children: children,
      });
    }
  }
  return visibleRoutes;
};

interface HeaderProps {
  theme: Theme;
  title: string;
  email?: string;
  currentPath: string;
}

const Header = (props: HeaderProps) => {
  const authContext = useAppAuthContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const routes = useAppSelector((state: RootState) => state.route.routes);
  const authorizedRoles: Role[] = useAppSelector((state: RootState) => state.auth.roles);
  const user = useAppSelector((state: RootState) => state.employee.employeeInfo);

  const scrollButtonRef = useRef<HTMLButtonElement>(null);
  const publiclyVisibleRoutes = useMemo(() => filterPubliclyVisibleRoutes(routes), [routes]);

  const navigateWithLoading = useCallback((path: string) => {
    if (path === pathname) return;
    dispatch(setNavigationLoading(true));
    navigate(path);
  }, [pathname, navigate, dispatch]);

  const newRoutes = useMemo(() => {
    const homeItem = publiclyVisibleRoutes.find((r) => r.routeId === ROUTE_ID_HOME);
    const otherRoutes = publiclyVisibleRoutes.filter(
      (r) => r.routeId !== ROUTE_ID_HOME && r.routeId !== ROUTE_ID_MY_BOARD,
    );

    // My Board Section
    const myBoardItem: RouteResponse = {
      menuItem: "My Board",
      path: "/my-board",
      routeId: ROUTE_ID_MY_BOARD,
      routeOrder: 1.5,
      children: [],
      isRouteVisible: true,
    };

    const baseMenuRoutes = homeItem
      ? [homeItem, myBoardItem, ...otherRoutes]
      : [myBoardItem, ...otherRoutes];

    const hasMoreItems = baseMenuRoutes.length > 6;
    let finalRoutes: RouteResponse[] = [];

    if (hasMoreItems) {
      const moreItem: RouteResponse = {
        menuItem: "more",
        path: "/MORE",
        routeId: ROUTE_ID_MORE,
        routeOrder: 6.5,
        children: baseMenuRoutes.slice(5),
        isRouteVisible: true,
      };
      finalRoutes = [...baseMenuRoutes.slice(0, 5), moreItem];
    } else {
      finalRoutes = [...baseMenuRoutes];
    }

    if (authorizedRoles.includes(Role.SALES_ADMIN)) {
      const adminPanelItem: RouteResponse = {
        menuItem: "Admin Panel",
        path: "#",
        routeId: ROUTE_ID_ADMIN_PANEL,
        routeOrder: 999,
        children: [
          {
            menuItem: "Edit Menu",
            path: "#admin-edit-menu",
            routeId: ROUTE_ID_ADMIN_EDIT_MENU,
            routeOrder: 1,
            children: [],
            isRouteVisible: true,
          },
          {
            menuItem: "Report",
            path: "/report",
            routeId: ROUTE_ID_ADMIN_REPORT,
            routeOrder: 2,
            children: [],
            isRouteVisible: true,
          },
          {
            menuItem: "Quiz Admin Dashboard",
            path: "/quiz-admin",
            routeId:ROUTE_ID_QUIZ_ADMIN,
            routeOrder: 3,
            children: [],
            isRouteVisible: true,
          }
        ],
        isRouteVisible: true,
      };

      const moreIndex = finalRoutes.findIndex((r) => r.menuItem?.toLowerCase() === "more");
      if (moreIndex >= 0) {
        finalRoutes.splice(moreIndex + 1, 0, adminPanelItem);
      } else {
        finalRoutes.push(adminPanelItem);
      }
    }

    return finalRoutes;
  }, [publiclyVisibleRoutes, authorizedRoles]);

  const [anchorElUser, setAnchorElUser] = useState<null | HTMLElement>(null);
  const userInfo = useSelector(selectUserInfo);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  const checkScrollTop = () => {
    if (scrollButtonRef.current) {
      if (window.scrollY > 100) scrollButtonRef.current.style.display = "block";
      else scrollButtonRef.current.style.display = "none";
    }
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  useEffect(() => {
    window.addEventListener("scroll", checkScrollTop);
    checkScrollTop();
    return () => window.removeEventListener("scroll", checkScrollTop);
  }, []);

  const handleCloseSideBar = useCallback(() => setMobileOpen(false), []);
  const handleOpenSideBar = useCallback(() => setMobileOpen(true), []);

  const adminPanelDrawerToggle = useCallback(() => {
    setAdminPanelOpen((prevState: unknown) => !prevState);
  }, []);

  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) =>
    setAnchorElUser(event.currentTarget);
  const handleCloseUserMenu = () => setAnchorElUser(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const linkElement = target.closest('a[href*="admin-edit-menu"]');

      if (linkElement) {
        e.preventDefault();
        e.stopPropagation();
        adminPanelDrawerToggle();
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [adminPanelDrawerToggle]);

  const handleSearchPage = () => navigateWithLoading("/search");

  const isMyBoardActive = matchPath("/my-board", pathname) !== null;

  return (
    <ColorModeContext.Consumer>
      {(colorMode) => (
        <Box>
          <CssBaseline />
          <StyledAppBar>
            <Toolbar sx={{ alignItems: "center" }}>
              <IconButton
                aria-label="open drawer"
                edge="start"
                onClick={handleOpenSideBar}
                sx={{
                  mr: 2,
                  mb: 1,
                  display: {
                    xs: "block",
                    sm: "block",
                    md: "block",
                    lg: "none",
                    xl: "none",
                  },
                  color: theme.palette.secondary.light,
                }}
              >
                <MenuIcon />
              </IconButton>

              {/* Brand area */}
              <Stack direction="row" alignItems="center" spacing={1} sx={{ flexGrow: 1 }}>
                <img
                  alt="wso2"
                  style={{
                    marginRight: "10px",
                    height: "20px",
                    maxWidth: "100px",
                  }}
                  src={theme.palette.mode === "dark" ? wso2LogoWhite : wso2Logo}
                />

                <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Typography
                  noWrap
                  component="div"
                  sx={{
                    fontWeight: 500,
                    fontSize: "1.25rem",
                    color: theme.palette.primary.contrastText,
                    lineHeight: 1,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                    {window.config?.APP_DETAILS?.NAME || ""}
                  </Typography>

                  {window.config?.IS_PITSTOP_APP == false && (
                    <Tooltip
                      title={`Switch to ${
                        window.config.REDIRECT_APP_NAME 
                      }`}
                    >
                      <Box
                        component="a"
                        href={
                          window.config.IS_PITSTOP_APP
                            ? window.config.SE_WIKI_URL
                            : window.config.SALES_PITSTOP_URL
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          px: 1.5,
                          py: 0.5,
                          fontWeight: 500,
                          borderRadius: "8px",
                          textDecoration: "none",
                          fontSize: "0.9rem",
                          letterSpacing: "0.01em",
                          color: theme.palette.primary.main,
                          background:
                            theme.palette.mode === "dark"
                              ? `linear-gradient(135deg, ${alpha(
                                  theme.palette.primary.main,
                                  0.15,
                                )} 0%, ${alpha(theme.palette.warning.main, 0.08)} 100%)`
                              : `linear-gradient(135deg, ${alpha(
                                  theme.palette.primary.main,
                                  0.08,
                                )} 0%, ${alpha(theme.palette.warning.main, 0.05)} 100%)`,
                          transition: "all 0.2s ease",
                          "&:hover": {
                            background:
                              theme.palette.mode === "dark"
                                ? `linear-gradient(135deg, ${alpha(
                                    theme.palette.primary.main,
                                    0.25,
                                  )} 0%, ${alpha(theme.palette.warning.main, 0.15)} 100%)`
                                : `linear-gradient(135deg, ${alpha(
                                    theme.palette.primary.main,
                                    0.15,
                                  )} 0%, ${alpha(theme.palette.warning.main, 0.1)} 100%)`,
                          },
                        }}
                      >
                        {window.config.REDIRECT_APP_NAME}
                        <OpenInNewIcon sx={{ fontSize: "0.9rem" }} />
                      </Box>
                    </Tooltip>
                  )}
                </Box>
              </Stack>

              {/*Desktop Nav Links*/}
              <List
                sx={{
                  display: {
                    xs: "none",
                    sm: "none",
                    md: "none",
                    lg: "flex",
                    xl: "flex",
                  },
                  flexDirection: "row",
                  alignItems: "center",
                  flexShrink: 0, 
                }}
              >
                {newRoutes.map((r, idx) => {
                  if (r.routeId === ROUTE_ID_MY_BOARD) {
                    return (
                      <ListItemButton
                        key={idx}
                        onClick={() => navigateWithLoading(r.path)}
                        sx={{
                          mx: 0.5,
                          px: 1.5,
                          py: 0.5,
                          borderRadius: "8px",
                          minWidth: "auto",
                          whiteSpace: "nowrap",
                          position: "relative",
                          "&:hover": {
                            backgroundColor:
                              theme.palette.mode === "dark"
                                ? "rgba(255, 255, 255, 0.08)"
                                : "rgba(0, 0, 0, 0.04)",
                          },
                          "&::after": {
                            content: '""',
                            position: "absolute",
                            bottom: "-8px",
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: isMyBoardActive ? "80%" : "0%",
                            height: "5px",
                            backgroundColor: theme.palette.primary.main,
                            borderRadius: "2px 2px 0 0",
                            transition: "width 0.3s ease",
                          },
                        }}
                      >
                        <DashboardIcon
                          sx={{
                            fontSize: "1.1rem",
                            mr: 0.5,
                            color: theme.palette.primary.main,
                          }}
                        />
                        <ListItemText
                          primary={r.menuItem}
                          primaryTypographyProps={{
                            sx: {
                              fontSize: "0.95rem",
                              fontWeight: isMyBoardActive ? 500 : 400,
                              color: theme.palette.primary.main,
                            },
                          }}
                        />
                      </ListItemButton>
                    );
                  }

                  if (r.routeId === ROUTE_ID_ADMIN_PANEL) {
                    return (
                      <ListItemLink
                        key={idx}
                        theme={props.theme}
                        to={"#"}
                        label={r.menuItem}
                        routeId={INVALID_ROUTE_ID}
                        primary={r.menuItem}
                        isActive={false}
                        children={r.children}
                        level={1}
                        handleSideBar={handleCloseSideBar}
                        isRouteVisible={r.isRouteVisible ? 1 : 0}
                      />
                    );
                  }

                  return (
                    <ListItemLink
                      key={idx}
                      theme={props.theme}
                      to={r.path}
                      label={r.menuItem}
                      routeId={r.routeId}
                      primary={r.menuItem}
                      isActive={matchPath(pathname, r.path) !== null}
                      children={r.children}
                      level={1}
                      handleSideBar={handleCloseSideBar}
                      isRouteVisible={r.isRouteVisible ? 1 : 0}
                    />
                  );
                })}
              </List>

              {/* Right-side utility icons */}
              <Stack
                flexDirection="row"
                gap={0.8}
                sx={{
                  marginLeft: theme.spacing(2),
                  marginRight: -0.5,
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <Tooltip title={theme.palette.mode === "light" ? "Dark mode" : "Light mode"}>
                  <IconButton
                    aria-label="toggle theme mode"
                    edge="start"
                    size="large"
                    onClick={colorMode.toggleColorMode}
                    sx={{
                      color: theme.palette.primary.contrastText,
                      "&:hover": {
                        background:
                          theme.palette.mode === "dark"
                            ? "rgba(18, 18, 18, 0.75)"
                            : "rgba(255, 255, 255, 0.75)",
                        boxShadow:
                          theme.palette.mode === "dark"
                            ? "0 12px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)"
                            : "0 12px 40px rgba(31, 38, 135, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
                      },
                    }}
                  >
                    {theme.palette.mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Browse Pages">
                  <IconButton
                    aria-label="open search-page"
                    edge="start"
                    size="large"
                    onClick={handleSearchPage}
                    sx={{
                      color: theme.palette.primary.contrastText,
                    }}
                  >
                    <SearchIcon />
                  </IconButton>
                </Tooltip>

                {userInfo && userInfo.email && (
                  <>
                    <IconButton
                      onClick={handleOpenUserMenu}
                      id="long-button"
                      aria-label="open user menu"
                      sx={{
                        p: 0,
                        ml: 0.5,
                      }}
                    >
                      <Avatar
                        sx={{
                          width: 35,
                          height: 35,
                          border: 1,
                          borderColor: "primary.main",
                        }}
                        alt={userInfo?.name}
                        src={user?.employeeThumbnail}
                      />
                    </IconButton>

                    {/*DropDown When User clicks on user thumbnail*/}
                    <Menu
                      sx={{ mt: "45px" }}
                      anchorEl={anchorElUser}
                      MenuListProps={{
                        "aria-labelledby": "long-button",
                      }}
                      id="user-menu"
                      anchorOrigin={{
                        vertical: "bottom",
                        horizontal: "left",
                      }}
                      transformOrigin={{
                        vertical: "top",
                        horizontal: "right",
                      }}
                      open={Boolean(anchorElUser)}
                      onClose={handleCloseUserMenu}
                    >
                      <Box sx={{ px: 2, py: 1.5 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar
                            sx={{
                              width: 36,
                              height: 36,
                              border: 1,
                              borderColor: "primary.main",
                            }}
                            alt={userInfo?.name}
                            src={user?.employeeThumbnail}
                          />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              noWrap
                              title={userInfo?.email}
                            >
                              {userInfo?.email}
                            </Typography>
                          </Box>
                        </Stack>
                      </Box>

                      <MenuItem
                        key={"logout"}
                        onClick={() => {
                          authContext.appSignOut();
                        }}
                      >
                        <ListItemIcon sx={{ color: "primary.main", minWidth: 32 }}>
                          <LogoutOutlined fontSize="small" />
                        </ListItemIcon>
                        <Typography textAlign="center">Logout</Typography>
                      </MenuItem>
                    </Menu>
                  </>
                )}
              </Stack>
            </Toolbar>
          </StyledAppBar>

          <nav>
            <Sidebar theme={theme} open={mobileOpen} handleDrawer={handleCloseSideBar} />
            <AdminPanelSideBar
              theme={theme}
              open={adminPanelOpen}
              handleDrawer={adminPanelDrawerToggle}
            />
            <Fab
              ref={scrollButtonRef}
              color="primary"
              aria-label="scroll to top"
              onClick={scrollToTop}
              sx={{
                position: "fixed",
                bottom: theme.spacing(2),
                right: theme.spacing(2),
                zIndex: theme.zIndex.modal + 1,
                display: "none",
                color: theme.palette.common.white,
              }}
            >
              <KeyboardArrowUpIcon sx={{ fontSize: 28 }} />
            </Fab>
          </nav>
        </Box>
      )}
    </ColorModeContext.Consumer>
  );
};

export default Header;
