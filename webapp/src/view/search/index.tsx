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

import { CURRENT_YEAR } from "@config/constant";
import Header from "@layout/header/index";
import ConfirmationModalContextProvider from "@context/DialogContext";
import { selectUserInfo } from "@slices/authSlice";
import pJson from "../../../package.json";
import { RootState, useAppSelector, useAppDispatch } from "@slices/store";
import { Outlet, useLocation, matchRoutes } from "react-router-dom";
import Search from "@components/ui/Search";
import ComponentCard from "@components/ui/content/Card";
import { Suspense, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Box from "@mui/material/Box";
import { styled, useTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import {
  CardMedia,
  Grid,
  Typography,
  Box as MuiBox,
  Pagination,
} from "@mui/material";
import { SkeletonCard } from "@components/ui/content/SkeletonCard";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import { clearSearchResults } from "@slices/pageSlice/page";
import searchImage from "@assets/images/search.png";

// For matomo integration
export declare let _paq: unknown[];

const ITEMS_PER_PAGE = 6; 

export default function Layout() {
  const routes = useAppSelector((state: RootState) => state.route.routes);
  const userInfo = useSelector(selectUserInfo);
  const searchData = useAppSelector((state: RootState) => state.page.searchResults);
  const searchState = useAppSelector(
    (state: RootState) => state.page.searchState
  );

  const location = useLocation();
  const theme = useTheme();
  const matches = matchRoutes(routes, location.pathname);
  const dispatch = useAppDispatch();

  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    dispatch(clearSearchResults());
  }, [dispatch]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchData]);

  const getAppBarTitle = (): string => {
    let title: string = "";
    matches?.forEach((obj) => {
      if (location.pathname === obj.pathname) {
        title = obj.route.menuItem;
      }
    });

    return title;
  };

  const totalPages = Math.ceil(searchData.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentPageData = searchData.slice(startIndex, endIndex);

  const handlePageChange = (_event: React.ChangeEvent<unknown>, page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 400, behavior: 'smooth' });
  };

  return (
    <ConfirmationModalContextProvider>
      <Box sx={{ display: "flex" }}>
        <CssBaseline />
        <Header
          theme={theme}
          title={getAppBarTitle()}
          currentPath={location.pathname}
          email={userInfo?.email}
        />
        <Box component="main" sx={{ flexGrow: 1, pt: 6 }}>
          <Suspense fallback={<div>Loading...</div>}>
            <Outlet />
          </Suspense>

          {/* Functionalities*/}

          <CustomBox
            sx={{ position: "relative", width: "100%", minHeight: "400px" }}
          >
            <CardMedia
              component="img"
              height="480"
              image={searchImage}
              alt="image"
              loading="lazy"
              sx={{
                backgroundColor: theme.palette.primary.main,
                objectFit: "cover",
              }}
            />
            <Box
              sx={{
                position: "absolute",
                top: "25%",
                left: "50%",
                color: "white",
                transform: "translate(-50%, -50%)",
                textAlign: "center",
                width: "100%",
                px: 2,
                zIndex: 2,
              }}
            >
              <Typography
                variant="h2"
                sx={{
                  fontWeight: 600,
                  textAlign: "center",
                  fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
                  textTransform: "uppercase",
                  letterSpacing: 4,
                  mt: 8,
                  mb: 0,
                  color: "white",
                }}
              >
                SEARCH
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  textAlign: "center",
                  fontSize: "clamp(0.95rem, 2vw, 1.25rem)",
                  fontWeight: 400,
                  lineHeight: 1.6,
                  color: "white",
                  maxWidth: "800px",
                  mx: "auto",
                }}
              >
                {window.config?.IS_PITSTOP_APP !== undefined && window.config.IS_PITSTOP_APP ?
                "Search across all sales resources with keywords or tags. Use the unified search bar to find exactly what you need."
                : "Search across all sales engineering resources with keywords or tags. Use the unified search bar to find exactly what you need."
                }
              </Typography>
            </Box>

            <Box
              sx={{
                position: "absolute",
                top: "60%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex",
                justifyContent: "center",
                width: "100%",
                zIndex: 2,
              }}
            >
              <Search />
            </Box>
          </CustomBox>

          <Box
            className="App"
            sx={{
              textAlign: "left",
              p: { xs: 4, sm: 4, md: 4 },
              mb: 4,
              mt: 2,
              maxWidth: "1400px",
              mx: "auto",
            }}
          >
            {/*Results count*/}
            {searchState === "success" && searchData.length > 0 && (
              <Box sx={{ mb: 4 }}>
                <Typography variant="h5" color="text.secondary" fontWeight={600}>
                  Showing {startIndex + 1}-{Math.min(endIndex, searchData.length)} of {searchData.length} results
                </Typography>
              </Box>
            )}

            {/*Search Results*/}
            <Grid
              container
              spacing={{ xs: 2, md: 3 }}
              columns={{ xs: 4, sm: 8, md: 12 }}
            >
              {currentPageData.map((content, index) => (
                <Grid
                  item
                  key={index}
                  xs={4}
                  sm={4}
                  md={4}
                  lg={3}
                  sx={{ mb: { xs: 2, md: 3 } }}
                >
                  <ComponentCard
                    contentLink={content.contentLink}
                    contentType={content.contentType}
                    contentSubtype={content.contentSubtype}
                    description={content.description}
                    thumbnail={content.thumbnail}
                    note={content.note}
                    likesCount={content.likesCount}
                    contentId={content.contentId}
                    sectionId={content.sectionId}
                    status={content.status}
                    contentOrder={content.contentOrder}
                    commentCount={content.commentCount}
                    createdOn={content.createdOn}
                    tags={content.tags}
                    customButtons={content.customButtons}
                    isInPinnedSection={content.sectionId === -2}
                  />
                </Grid>
              ))}

              {searchState === "loading" &&
                [...Array(3)].map((_, index) => (
                  <Grid item key={index} xs={4} sm={4} md={4} lg={3}>
                    <SkeletonCard />
                  </Grid>
                ))}

              {/*Empty state*/}
              {searchState === "success" && searchData.length === 0 && (
                <Box
                  sx={{
                    width: "100%",
                    py: 8,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                      "@keyframes float": {
                        "0%": { transform: "translateY(0px)" },
                        "50%": { transform: "translateY(-10px)" },
                        "100%": { transform: "translateY(0px)" },
                      },
                    }}
                  >
                    <Box
                      sx={{
                        mb: 2,
                        animation: "float 3s ease-in-out infinite",
                      }}
                    >
                      <SearchOffIcon
                        sx={{
                          fontSize: 72,
                          color: theme.palette.text.secondary,
                        }}
                      />
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                      No results found
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ maxWidth: 480, color: "text.secondary" }}
                    >
                      We couldn't find anything matching your search. Please try
                      again.
                    </Typography>
                  </Box>
              )}
              {/*END Empty state*/}
            </Grid>

            {/*Pagination*/}
            {searchState === "success" && searchData.length > ITEMS_PER_PAGE && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  mt: 4,
                  mb: 2,
                }}
              >
                <Pagination
                  count={totalPages}
                  page={currentPage}
                  onChange={handlePageChange}
                  color="primary"
                  size="large"
                  showFirstButton
                  showLastButton
                />
              </Box>
            )}
          </Box>
          <Box sx={{ height: "38px", width: "100%" }} aria-hidden="true" />
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
              zIndex: 1300,
            }}
          >
            <Typography variant="h6" sx={{ color: "#919090", pl: 2 }}>
              v {pJson.version} | © {CURRENT_YEAR} WSO2 LLC
            </Typography>
          </Box>
        </Box>
      </Box>
    </ConfirmationModalContextProvider>
  );
}

const CustomBox = styled(MuiBox)(() => ({
  position: "relative",
  overflow: "hidden",
  alignItems: "center",
  justifyContent: "center",
  "& video": {
    width: "100%",
    height: "auto",
    objectFit: "cover",
  },
  "&::before": {
    content: '""',
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background:
      "linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.3) 100%)",
    zIndex: 1,
  },
}));
