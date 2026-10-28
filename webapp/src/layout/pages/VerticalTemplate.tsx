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

import {
  Box,
  CardMedia,
  Stack,
  Grow,
  Typography,
  useTheme,
} from "@mui/material";
import { RootState, useAppSelector, useAppDispatch } from "@slices/store";
import Header from "../header/index";
import { matchRoutes, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectUserInfo } from "@slices/authSlice";
import { CustomBox } from "@components/common/Common";
import { useEffect, useMemo } from "react";
import ComponentCard from "@components/ui/content/Card";
import { SkeletonCard } from "@components/ui/content/SkeletonCard";
import { filterContent } from "@slices/pageSlice/page";

export default function VerticalTemplate() {
  const routes = useAppSelector((state: RootState) => state.route.routes);
  const searchData = useAppSelector((state: RootState) => state.page.searchResults);
  const searchState = useAppSelector(
    (state: RootState) => state.page.searchState
  );
  const userInfo = useSelector(selectUserInfo);
  const dispatch = useAppDispatch();
  const location = useLocation();
  const theme = useTheme();
  const matches = matchRoutes(routes, location.pathname);

  const { title, tags } = useMemo((): { title: string; tags: string[] } => {
    const pathSegments = location.pathname.split("/").filter(Boolean);
    const title = pathSegments[1] ? decodeURIComponent(pathSegments[1]) : "";
    const tags = pathSegments[2]
      ? pathSegments[2].split("-").map((tag) => decodeURIComponent(tag))
      : [];

    return { title, tags };
  }, [location.pathname]);

  useEffect(() => {
    dispatch(filterContent({ inputTags: tags }));
  }, [dispatch, tags]);

  const getAppBarTitle = (): string => {
    let title: string = "";
    matches?.forEach((obj) => {
      if (location.pathname === obj.pathname) {
        title = obj.route.menuItem;
      }
    });
    return title;
  };

  return (
    <Box>
      <Header
        theme={theme}
        title={getAppBarTitle()}
        currentPath={location.pathname}
        email={userInfo?.email}
      />
      <Box sx={{ overflow: "hidden", position: "relative" }}>
        <Grow in>
          <CustomBox>
            <Box sx={{ backgroundColor: theme.palette.primary.main }}>
              <CardMedia
                component="img"
                height="80vh"
                alt="image"
                loading="lazy"
              />
            </Box>
            <Box
              sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                color: "white",
                textAlign: "center",
                pt: 8,
              }}
            >
              <Typography variant="h1">{title}</Typography>
            </Box>
          </CustomBox>
        </Grow>
        <Box
          className="App"
          sx={{ textAlign: "left", p: { xs: 4, sm: 4, md: 4 }, mb: 4, mt: 4 }}
        >
          <Stack
            direction="row"
            flexWrap="wrap"
            spacing={{ xs: 2, md: 3 }}
            useFlexGap
          >
            {searchData.map((contentLink, index) => (
              <Box
                key={index}
                sx={{
                  width: {
                    xs: "100%",
                    sm: "calc(50% - 12px)",
                    md: "calc(33.333% - 16px)",
                    lg: "calc(25% - 18px)",
                  },
                }}
              >
                <ComponentCard
                  contentLink={contentLink.contentLink}
                  contentType={contentLink.contentType}
                  contentSubtype={contentLink.contentSubtype}
                  description={contentLink.description}
                  note={contentLink.note}
                  likesCount={contentLink.likesCount}
                  contentId={contentLink.contentId}
                  sectionId={contentLink.sectionId}
                  status={contentLink.status}
                  contentOrder={contentLink.contentOrder}
                  commentCount={contentLink.commentCount}
                  createdOn={contentLink.createdOn}
                  tags={contentLink.tags}
                  customButtons={contentLink.customButtons}
                  isInPinnedSection={contentLink.sectionId === -2}
                />
              </Box>
            ))}

            {searchState === "loading" &&
              [...Array(3)].map((_, index) => (
                <Box
                  key={index}
                  sx={{
                    width: {
                      xs: "100%",
                      sm: "calc(50% - 12px)",
                      md: "calc(33.333% - 16px)",
                      lg: "calc(25% - 18px)",
                    },
                  }}
                >
                  <SkeletonCard />
                </Box>
              ))}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
