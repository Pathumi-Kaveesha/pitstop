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

import Contents from "@components/ui/section/Contents";
import Template from "@layout/pages/Template";
import { RootState, useAppDispatch, useAppSelector } from "@slices/store";
import PreLoader from "@components/common/PreLoader";
import { useEffect } from "react";
import { getPageData, resetPageData } from "@slices/pageSlice/page";
import { updateRouterPath } from "@slices/routeSlice/route";
import { useLocation, useNavigate } from "react-router-dom";
import { RouteResponse } from "@/types/types";
// For matomo integration
export declare let _paq: unknown[];

const Component: React.FC = () => {
  const route = useAppSelector((state: RootState) => state.route);
  const page = useAppSelector((state: RootState) => state.page);
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();

  // Handle redirect for invisible routes
  useEffect(() => {
    if (route.pageData?.shouldRedirect) {
      navigate("/");
    }
  }, [route.pageData?.shouldRedirect, navigate]);

  useEffect(() => {
    if (!route.routes || route.routes.length === 0) return;

    const decodedPathname = decodeURIComponent(location.pathname);

    const findRoute = (
      routes: RouteResponse[],
      path: string
    ): RouteResponse | null => {
      for (const r of routes) {
        if (r.path.toLowerCase() === path.toLowerCase()) return r;
        if (r.children?.length) {
          const found = findRoute(r.children, path);
          if (found) return found;
        }
      }
      return null;
    };

    const matchedRoute = findRoute(route.routes, decodedPathname);

    if (matchedRoute) {
      if (route.routeId !== matchedRoute.routeId || route.currentPath !== matchedRoute.path) {
        dispatch(
          updateRouterPath({
            routeId: matchedRoute.routeId,
            currentPath: matchedRoute.path,
            label: matchedRoute.menuItem,
            children: matchedRoute.children || [],
          })
        );
      }
    dispatch(resetPageData());
    
    dispatch(getPageData(location.pathname));
    }
  }, [location.pathname, route.routes, route.routeId, route.currentPath, dispatch]);

  const isLoading =
    page.state === "loading" || page.pageDataState === "loading";

  return (
    <>
      {isLoading ? (
        <PreLoader isLoading={true} />
      ) : (
        <>
          <Template key={location.pathname} />
          <Contents />
        </>
      )}
    </>
  );
};

export default Component;
