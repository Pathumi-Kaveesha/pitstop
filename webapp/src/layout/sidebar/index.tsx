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

import { useState } from "react";
import { SIDEBAR_WIDTH } from "@config/constant";
import { RootState, useAppSelector } from "@slices/store";
import ListItemLink from "@components/layout/LinkItem";
import { MenuContainerContext } from "@components/layout/MenuContainerContext";
import { SidebarProps } from "@/types/types";
import { styled } from "@mui/material/styles";
import { MUIStyledCommonProps } from "@mui/system";
import { useLocation, matchPath } from "react-router-dom";
import { List, Drawer, useTheme } from "@mui/material";

//Side Bar
const Sidebar = (props: SidebarProps) => {
  const routes = useAppSelector((state: RootState) => state.route.routes);
  const theme = useTheme();
  const { pathname } = useLocation();
  // The drawer's panel: its menus are drawn inside it, so screen readers and the Tab key can reach them while the drawer is open
  const [menuContainer, setMenuContainer] = useState<HTMLElement | null>(null);

  //For the Drawer creating the tree structure
  const drawer = (
    <>
      <List sx={{ mt: 10 }}>
        {routes.map((r, idx) => (
          <ListItemLink
            key={idx}
            theme={props.theme}
            to={r.path}
            label={r.menuItem}
            routeId={r.routeId}
            primary={r.menuItem}
            isActive={matchPath(r.path, pathname) !== null}
            children={r.children}
            handleSideBar={props.handleDrawer}
            level={1}
            isRouteVisible={0}
          />
        ))}
      </List>
    </>
  );

  return (
    <Drawer
      variant="temporary"
      open={props.open}
      onClose={props.handleDrawer}
      ModalProps={{
        keepMounted: true,
      }}
      slotProps={{ paper: { ref: setMenuContainer } }}
      sx={{
        "& .MuiDrawer-paper": {
          boxSizing: "border-box",
          width: SIDEBAR_WIDTH,
          background: theme.palette.secondary.main,
        },
      }}
    >
      <MenuContainerContext.Provider value={menuContainer}>{drawer}</MenuContainerContext.Provider>
    </Drawer>
  );
};

export default Sidebar;

interface DrawerHeaderInterface extends MUIStyledCommonProps {
  open: boolean;
}

export const DrawerFooter = styled("div")(({ theme }) => ({
  position: "relative",
  bottom: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  padding: theme.spacing(0, 2),
  ...theme.mixins.toolbar,
}));

export const DrawerHeader = styled("div")<DrawerHeaderInterface>(({ theme, open }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  transition: theme.transitions.create(["display"], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  ...theme.mixins.toolbar,
  ...(open && {
    justifyContent: "flex-start",
  }),
}));
