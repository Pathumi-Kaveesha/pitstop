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
import { Box, Typography, useTheme } from "@mui/material";
import { DataGrid, GridColDef, GridRowClassNameParams } from "@mui/x-data-grid";
import { useSelector } from "react-redux";
import { matchRoutes, useLocation } from "react-router-dom";

import { useEffect } from "react";

import ErrorHandler from "@components/common/ErrorHandler";
import { CURRENT_YEAR } from "@config/constant";
import Header from "@layout/header/index";
import { ContentReportResponse } from "@root/src/types/types";
import { selectUserInfo } from "@slices/authSlice";
import { getContentReport } from "@slices/pageSlice/page";
import { RootState, useAppDispatch, useAppSelector } from "@slices/store";

import pJson from "../../../package.json";

export default function Summary() {
  const routes = useAppSelector((state: RootState) => state.route.routes);
  const contentReportData = useAppSelector((state: RootState) => state.page.contentReport);
  const contentReportState = useAppSelector((state: RootState) => state.page.contentReportState);
  const userInfo = useSelector(selectUserInfo);
  const dispatch = useAppDispatch();

  const location = useLocation();
  const matches = matchRoutes(routes, location.pathname);
  const theme = useTheme();

  const getAppBarTitle = (): string => {
    let title: string = "";
    matches?.forEach((obj) => {
      if (location.pathname === obj.pathname) {
        title = obj.route.menuItem;
      }
    });

    return title;
  };

  useEffect(() => {
    dispatch(getContentReport());
  }, [dispatch]);

  const rowData = contentReportData.map((item: ContentReportResponse, index: number) => ({
    id: index + 1,
    ...item,
  }));

  const columns: GridColDef[] = [
    { field: "contentName", headerName: "Content Name", flex: 1 },
    {
      field: "contentLink",
      headerName: "Content Link",
      flex: 1.5,
      renderCell: (params) => (
        <a
          href={params.value}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#1976d2", textDecoration: "none" }}
        >
          {params.value}
        </a>
      ),
    },
    { field: "pageName", headerName: "Page", flex: 1 },
    { field: "sectionName", headerName: "Section", flex: 1 },
    { field: "createdBy", headerName: "Created By", flex: 1 },
    { field: "createdDate", headerName: "Created Date", flex: 1 },
    { field: "lastVerifiedBy", headerName: "Last Verified By", flex: 1 },
    { field: "lastVerifiedDate", headerName: "Last Verified Date", flex: 1 },
  ];

  //To filter if more than 3 months
  const isMoreThanThreeMonths = (dateStr: string | undefined) => {
    if (!dateStr) return false;

    const lastVerifiedDate = new Date(dateStr);
    const currentDate = new Date();

    const threeMonthsLater = new Date(lastVerifiedDate);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    return currentDate > threeMonthsLater;
  };

  //Checks if each row if more than 3 months
  const getRowClassName = (params: GridRowClassNameParams) => {
    const lastVerifiedDate = params.row.lastVerifiedDate;
    if (isMoreThanThreeMonths(lastVerifiedDate)) {
      return "row-outdated";
    }
    return "";
  };

  return (
    <Box
      sx={{
        pt: 10,
        backgroundColor:
          theme.palette.mode === "dark" ? theme.palette.background.default : "#f5f5f5",
        minHeight: "100vh",
      }}
    >
      <Header
        theme={theme}
        title={getAppBarTitle()}
        currentPath={location.pathname}
        email={userInfo?.email}
      />
      <Box
        sx={{
          color: theme.palette.text.primary,
          pl: "40px",
          pr: "40px",
          pt: "30px",
          pb: "20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Typography variant="h3" sx={{ fontWeight: 700, mb: 1, mt: 2, alignSelf: "center" }}>
          Content Report
        </Typography>
        <Typography variant="h6" sx={{ color: "#666", mb: 2, alignSelf: "center" }}>
          Summary of uploaded content
        </Typography>
      </Box>

      <Box
        sx={{
          pl: "40px",
          pr: "40px",
          pb: "30px",
          height: "calc(100vh - 250px)",
        }}
      >
        {contentReportState === "failed" && <ErrorHandler message={"Something went wrong"} />}
        {contentReportState === "success" && (
          <DataGrid
            showToolbar
            rows={rowData}
            getRowClassName={getRowClassName}
            columns={columns}
            initialState={{
              pagination: {
                paginationModel: {
                  pageSize: 10,
                },
              },
            }}
            pageSizeOptions={[10, 25, 50]}
            sx={{
              backgroundColor:
                theme.palette.mode === "dark" ? "#1e1e1e" : theme.palette.background.paper,
              border: "none",
              borderRadius: "8px",
              boxShadow: theme.palette.mode === "dark" ? "none" : "0 1px 3px rgba(0,0,0,0.1)",
              "& .MuiDataGrid-toolbarContainer": {
                padding: "16px",
                borderBottom: `1px solid ${theme.palette.divider}`,
                "& .MuiButton-root": {
                  color: "#ff6b35",
                  border: "1px solid #ff6b35",
                  borderRadius: "6px",
                  textTransform: "uppercase",
                  fontSize: "13px",
                  fontWeight: 600,
                  padding: "6px 16px",
                  marginRight: "12px",
                },
              },
              "& .MuiDataGrid-columnHeaders": {
                backgroundColor:
                  theme.palette.mode === "dark" ? theme.palette.background.default : "#fafafa",
                borderBottom: `2px solid ${theme.palette.divider}`,
              },
              "& .MuiDataGrid-columnHeaderTitle": {
                fontWeight: 600,
                fontSize: "14px",
                color: theme.palette.text.primary,
              },
              "& .Mui-selected": {
                background:
                  theme.palette.mode === "dark"
                    ? "rgba(255, 255, 255, 0.08) !important"
                    : "#EFEFEF !important",
              },
              "& .MuiDataGrid-cell": {
                color: theme.palette.text.primary,
                fontSize: "14px",
                borderBottom: `1px solid ${theme.palette.divider}`,
              },
              "& .MuiDataGrid-row:hover": {
                backgroundColor:
                  theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.05)" : "#fafafa",
              },
              "& .row-outdated": {
                backgroundColor: "#FFCDD2",
                "&:hover": {
                  backgroundColor: "#FFA1AA",
                },
              },
              "& .MuiDataGrid-footerContainer": {
                backgroundColor:
                  theme.palette.mode === "dark" ? theme.palette.background.default : "#fafafa",
                borderTop: `1px solid ${theme.palette.divider}`,
              },
              "& .MuiTablePagination-displayedRows": {
                fontSize: "13px",
                margin: 0,
              },
              "& .MuiTablePagination-selectLabel": {
                fontSize: "13px",
                margin: 0,
              },
            }}
          />
        )}
      </Box>

      <Box
        className="layout-note"
        component="footer"
        sx={{
          background: theme.palette.secondary.main,
          height: "38px",
          position: "fixed",
          pt: 1,
          bottom: 0,
          width: "100%",
          boxShadow: "0px -4px 12px rgba(0, 0, 0, 0.1)",
        }}
      >
        <Typography variant="h6" sx={{ color: "#919090", pl: 2 }}>
          v {pJson.version} | © {CURRENT_YEAR} Choreo Labs LLC
        </Typography>
      </Box>
    </Box>
  );
}
