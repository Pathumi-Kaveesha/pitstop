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

import Error from "../layout/pages/404";
import MaintenancePage from "@layout/pages/Maintenance";
import { getActiveRoutesV2 } from "../route";
import Layout from "../layout/Layout";
import { RootState, useAppSelector } from "@slices/store";
import PreLoader from "@components/common/PreLoader";
import ErrorHandler from "@components/common/ErrorHandler";
import Search from "@view/search/index";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { useMemo } from "react";
import Summary from "@view/summary/index";
import VerticalTemplate from "@layout/pages/VerticalTemplate";
import React from "react";
import { View } from "@root/src/view";

// For matomo integration
export declare let _paq: unknown[];

const AppHandler = () => {
  const auth = useAppSelector((state: RootState) => state.auth);
  const route = useAppSelector((state: RootState) => state.route);

  const router = useMemo(() => createBrowserRouter([
    {
      path: "/",
      element: <Layout />,
      errorElement: <Error />,
      children: getActiveRoutesV2(route.routes),
    },
    {
      path: "/search",
      element: <Search />,
      errorElement: <Error />,
    },
    {
      path: "/report",
      element: <Summary />,
      errorElement: <Error />,
    },
    {
      path: "/my-board",
      element: React.createElement(View.MyBoard),
      errorElement: <Error />,
    },
    {
      path: "/vertical/:verticalName/:tags",
      element: <VerticalTemplate />,
      errorElement: <Error />,
    },
    {
      path: "/quiz-admin",
      element: React.createElement(View.QuizAdminDashboard),
      errorElement: <Error />,
    },
  ]), [route.routes]);

  return (
    <>
      {auth.status === "loading" && <PreLoader isLoading={true} message={auth.statusMessage}></PreLoader>}
      {auth.status === "success" && auth.mode === "active" && route.routes.length > 0 && (
        <RouterProvider router={router} />
      )}
      {auth.status === "success" && auth.mode === "active" && route.routes.length === 0 && route.state === "failed" && (
        <ErrorHandler message={route.stateMessage} />
      )}
      {auth.status === "success" && auth.mode === "maintenance" && <MaintenancePage />}
      {auth.status === "failed" && <ErrorHandler message={auth.errorMessage} />}
    </>
  );
};

export default AppHandler;
