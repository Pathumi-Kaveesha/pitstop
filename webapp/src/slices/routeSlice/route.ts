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
import { PayloadAction, createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { AppConfig } from "@config/config";
import { enqueueSnackbarMessage } from "@slices/commonSlice/common";
import { getPageData } from "@slices/pageSlice/page";
import { ApiService } from "@utils/apiService";

import {
  PageData,
  RoutePayload,
  RouteResponse,
  RouteStatuses,
  UpdateRoutePayload,
  reparentRoutesPayload,
} from "@/types/types";

const initialState: RouteState = {
  stateMessage: null,
  state: "idle",
  pageDataState: "idle",
  currentPath: "/",
  routeId: 1,
  label: "home",
  childrenRoutes: [],
  routes: [],
  pageData: undefined,
  isRouteVisible: 1,
  reparentingState: "idle",
};

interface RouteState {
  state?: RouteStatuses;
  pageDataState?: RouteStatuses;
  currentPath: string;
  label: string;
  routeId: number;
  childrenRoutes: RouteResponse[];
  stateMessage: string | null;
  routes: RouteResponse[];
  pageData?: PageData;
  isRouteVisible: number;
  reparentingState: RouteStatuses;
}

export const RouteSlice = createSlice({
  name: "getFormInfo",
  initialState,
  reducers: {
    updateRouterPath: (
      state,
      action: PayloadAction<{
        routeId: number;
        currentPath: string;
        label: string;
        children: RouteResponse[];
      }>,
    ) => {
      state.routeId = action.payload.routeId;
      state.currentPath = action.payload.currentPath;
      state.label = action.payload.label;
      state.childrenRoutes = action.payload.children;
    },
    updateRouteId: (state, action: PayloadAction<number>) => {
      state.routeId = action.payload;
    },
    updateStateMessage: (state, action: PayloadAction<unknown>) => {
      state.stateMessage = action.payload as string;
    },
  },
  extraReducers: (builder) => {
    builder
      // Create Route Path
      .addCase(createNewRoute.pending, (state) => {
        state.state = "loading";
      })
      .addCase(createNewRoute.fulfilled, (state) => {
        state.stateMessage = "You have successfully created a page";
        state.state = "success";
      })
      .addCase(createNewRoute.rejected, (state) => {
        state.stateMessage = "Something went wrong while creating a route :(";
        state.state = "failed";
      })

      //Get Route Paths
      .addCase(getRoutesInfo.pending, (state) => {
        state.state = "loading";
      })
      .addCase(getRoutesInfo.fulfilled, (state, action) => {
        const newRoutes = action.payload.routesInfo;
        state.routes = [
          {
            path: "/",
            menuItem: "Home",
            routeId: 1,
            routeOrder: 0,
            isRouteVisible: true,
          },
          ...newRoutes,
          {
            path: "/my-board",
            menuItem: "My Board",
            routeId: -5,
            routeOrder: 1000,
            isRouteVisible: true,
          },
        ];
        state.state = "success";
      })
      .addCase(getRoutesInfo.rejected, (state) => {
        state.state = "failed";
        state.stateMessage = "Error while fetching all page data :(";
      })

      //Update Route Path
      .addCase(updateRoute.pending, (state) => {
        state.state = "loading";
      })
      .addCase(updateRoute.fulfilled, (state, action) => {
        state.state = "success";
        state.stateMessage = "You have successfully updated the page";

        const { reorderRoutes: reorderRoutesPayload, parentId } = action.meta.arg.page;

        if (reorderRoutesPayload) {
          const orderMap = new Map<number, number>(
            reorderRoutesPayload.map((r) => [r.routeId, r.routeOrder]),
          );

          const sortByOrderMap = (routes: RouteResponse[]) =>
            [...routes].sort(
              (a, b) =>
                (orderMap.get(a.routeId) ?? a.routeOrder) -
                (orderMap.get(b.routeId) ?? b.routeOrder),
            );

          const updateChildrenRecursively = (routes: RouteResponse[]): RouteResponse[] =>
            routes.map((route) => {
              if (route.routeId === parentId) {
                return {
                  ...route,
                  children: sortByOrderMap(route.children ?? []).map((child) => ({
                    ...child,
                    routeOrder: orderMap.get(child.routeId) ?? child.routeOrder,
                  })),
                };
              } else if (route.children && route.children.length > 0) {
                return {
                  ...route,
                  children: updateChildrenRecursively(route.children),
                };
              } else {
                return route;
              }
            });

          if (!parentId) {
            const topLevelRoutes = state.routes.map((route) => ({
              ...route,
              routeOrder: orderMap.get(route.routeId) ?? route.routeOrder,
            }));

            state.routes = sortByOrderMap(topLevelRoutes);

            if (!state.routeId || state.routeId === 1) {
              state.childrenRoutes = state.routes.filter((route) => route.routeId !== 1);
            }
          } else {
            state.routes = updateChildrenRecursively(state.routes);

            if (parentId === state.routeId) {
              const reorderedParent = state.routes.find((route) => route.routeId === parentId);
              if (reorderedParent?.children) {
                state.childrenRoutes = reorderedParent.children.map((child) => ({
                  ...child,
                  routeOrder: orderMap.get(child.routeId) ?? child.routeOrder,
                }));
              }
            }
          }
        }
      })
      .addCase(updateRoute.rejected, (state) => {
        state.state = "failed";
        state.stateMessage = "Something went wrong :(";
      })

      //Delete Route Path
      .addCase(deleteRoute.pending, (state) => {
        state.state = "loading";
      })
      .addCase(deleteRoute.fulfilled, (state) => {
        state.state = "success";
        state.stateMessage = "You have successfully deleted the page";
      })
      .addCase(deleteRoute.rejected, (state) => {
        state.state = "failed";
        state.stateMessage = "Something went wrong :(";
      })
      // Reparent Route
      .addCase(reparentRoutes.pending, (state) => {
        state.state = "loading";
        state.reparentingState = "loading";
      })
      .addCase(reparentRoutes.fulfilled, (state) => {
        state.state = "success";
        state.stateMessage = "Pages reparented successfully";
        state.reparentingState = "success";
      })
      .addCase(reparentRoutes.rejected, (state) => {
        state.state = "failed";
        state.stateMessage = "Error while reparenting pages :(";
        state.reparentingState = "idle";
      });
  },
});

//Get new route paths
export const getRoutesInfo = createAsyncThunk(
  "pitstop/getRoutesInfo",
  async (_routePath: string, { dispatch }) => {
    return new Promise<{
      routesInfo: RouteResponse[];
    }>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.createRouterPath)
        .then((resp) => {
          if (resp.status === 200) {
            resolve({
              routesInfo: resp.data,
            });
          }
        })
        .catch((error: Error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while fetching all page data :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            }),
          );
          reject(error);
        });
    });
  },
);

//Create a new route path
export const createNewRoute = createAsyncThunk(
  "pitstop/createRouterPath",
  async (payload: { newContent: RoutePayload; routePath: string }, { dispatch }) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .post(AppConfig.serviceUrls.createRouterPath, payload.newContent)
        .then((resp) => {
          resolve({ requestResponse: resp.data });
          dispatch(
            enqueueSnackbarMessage({
              message: "You have successfully created a new page.",
              type: "success",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            }),
          );
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while creating a new page :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            }),
          );
          reject(resp);
        })
        .finally(() => {
          dispatch(getRoutesInfo(payload.routePath));
        });
    });
  },
);

//Delete a particular route path
export const deleteRoute = createAsyncThunk(
  "pitstop/deleteRouterPath",
  async (payload: { routeId: number; routePath: string }, { dispatch }) => {
    return new Promise<unknown>((reject) => {
      ApiService.getInstance()
        .delete(AppConfig.serviceUrls.deleteRouterPath + payload.routeId)
        .then(() => {
          dispatch(
            enqueueSnackbarMessage({
              message: "You have successfully deleted the page.",
              type: "success",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            }),
          );
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while deleting the page :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            }),
          );
          reject(resp);
        })
        .finally(() => {
          dispatch(getRoutesInfo(payload.routePath));
        });
    });
  },
);

//Update a particular route path
export const updateRoute = createAsyncThunk(
  "pitstop/updatePage",
  async (payload: { routeId: string; page: UpdateRoutePayload; routePath: string }, { dispatch }) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .patch(AppConfig.serviceUrls.updateRouterPath(payload.routeId), payload.page)
        .then((resp) => {
          resolve({ requestResponse: resp.data });
          dispatch(
            enqueueSnackbarMessage({
              message: "You have successfully edit the page details.",
              type: "success",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            }),
          );
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while updating the page :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            }),
          );
          reject(resp);
        })
        .finally(() => {
          if (!payload.page.reorderRoutes?.length) {
            const newPath = payload.page.routePath ?? payload.routePath;
            const pathChanged =
              !!payload.page.routePath && payload.page.routePath !== payload.routePath;
            if (pathChanged) {
              window.location.href = payload.page.routePath as string;
            } else {
              dispatch(getRoutesInfo(newPath)).then(() => {
                dispatch(getPageData(newPath));
              });
            }
          }
        });
    });
  },
);

//Reparent Routes
export const reparentRoutes = createAsyncThunk(
  "pitstop/reparentRoutes",
  async (payload: reparentRoutesPayload, { dispatch }) => {
    return new Promise<void>((resolve, reject) => {
      const requestPayload = {
        newParentId: payload.newParentId,
        routeIds: payload.routeIds,
      };

      ApiService.getInstance()
        .patch(AppConfig.serviceUrls.reparentRoutes, requestPayload)
        .then((resp) => {
          if (resp.status === 200) {
            dispatch(
              enqueueSnackbarMessage({
                message: "Pages reparented successfully",
                type: "success",
                anchorOrigin: { vertical: "bottom", horizontal: "right" },
              }),
            );
            resolve();
            dispatch(getRoutesInfo("/"));
          }
        })
        .catch((error) => {
          // A refused move comes back with its reason
          const reason =
            error?.response?.status === 400 ? error?.response?.data?.message : undefined;
          dispatch(
            enqueueSnackbarMessage({
              message: reason ?? "Error while reparenting pages :(",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const { updateRouterPath, updateRouteId } = RouteSlice.actions;
export default RouteSlice.reducer;
