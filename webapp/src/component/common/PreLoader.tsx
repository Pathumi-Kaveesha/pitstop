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

import { PreLoaderProps } from "@/types/types";
import Typography from "@mui/material/Typography";
import { Box, Container, Stack } from "@mui/material";
import LinearProgress from "@mui/material/LinearProgress";
import { useEffect, useState } from "react";
import choreoLabsLogoWhite from "@assets/images/choreo-labs-logo-white.svg";
import { useTheme } from "@mui/material/styles";

function CustomLinearProgress() {
  const theme = useTheme();
  return (
    <Box sx={{ width: 200 }}>
      <LinearProgress
        sx={{
          "& .MuiLinearProgress-bar": {
            backgroundColor: theme.palette.orange[300],
          },
          backgroundColor: theme.palette.common.black,
        }}
      />
    </Box>
  );
}

const PreLoader = (props: PreLoaderProps) => {
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    if (!props.isLoading) {
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    } else {
      setShouldRender(true);
    }
  }, [props.isLoading]);

  if (!shouldRender) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "#1a1a1a",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        height: "100vh",
        opacity: props.isLoading ? 1 : 0,
        transition: "opacity 0.3s ease-in-out",
        pointerEvents: props.isLoading ? "auto" : "none",
      }}
    >
      <Container maxWidth="md">
        <Box justifyContent="center" alignItems="center">
          <Stack
            direction="column"
            justifyContent="center"
            alignItems="center"
            spacing={2}
          >
            <Box>
              {!props.hideLogo && (
                <img
                  alt="Choreo Labs"
                  width="200"
                  height="auto"
                  src={choreoLabsLogoWhite}
                />
              )}
            </Box>
            <Box>
              <Typography
                variant="body1"
                sx={{
                  color: "#fff",
                  textAlign: "center",
                  fontSize: "14px",
                  fontWeight: 300,
                }}
              >
                {props.message ?? window.config?.APP_DETAILS?.NAME ?? ""}
              </Typography>
            </Box>
            <Box>
              <CustomLinearProgress />
            </Box>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};

export default PreLoader;
