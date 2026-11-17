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

import { useEffect, useState } from "react";
import { Role } from "@utils/types";
import { IconButton } from "@components/common/Common";
import { Typography, Box, Tooltip, Stack } from "@mui/material";
import { ImageSectionProps } from "@/types/types";
import getCroppedImg from "@utils/imageCrop";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

const ImageSection = ({
  imageUrl,
  title,
  customSectionTheme,
  redirectUrl,
  actions,
  authorizedRoles,
}: ImageSectionProps) => {
  const cropSizing = customSectionTheme?.cropSizing;
  const [croppedImage, setCroppedImage] = useState<string | null>(null);

  useEffect(() => {
    if (cropSizing && imageUrl) {
      getCroppedImg(imageUrl, cropSizing)
        .then((croppedImage) => {
          setCroppedImage(croppedImage);
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }, [imageUrl, cropSizing]);

  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: 200,
        background: `url(${croppedImage ?? imageUrl}) no-repeat center center`,
        backgroundSize: "cover",
        marginX: 4,
        borderRadius: 6,
        "&:hover": {
          background: `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url(${croppedImage ?? imageUrl}) no-repeat center center `,
          backgroundSize: "cover",
        },
      }}
    >
      <Tooltip arrow title={"View " + title} sx={{ zIndex: 1000000 }}>
        <Typography
          variant="h3"
          sx={{
            textShadow: "3px 4px 7px #000",
            cursor: "pointer",
            target: "_blank",
            ...customSectionTheme?.title,
          }}
        >
          {title}
        </Typography>
      </Tooltip>
      <Stack
        flexDirection="row"
        sx={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 1000001,
          gap: 1.2,
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.55)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          alignItems: "center",
        }}
      >
        {redirectUrl && (
          <Tooltip title="View related contents" arrow>
        <IconButton
          size="small"
          aria-label="redirect to link"
          onClick={() => window.open(redirectUrl, "_blank", "noopener,noreferrer")}
          sx={{
            cursor: "pointer",
            color: "white",
            borderRadius: 8,
            bgcolor: "#ff7300",
            padding: "6px",
            "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.7)" },
          }}
        >
          <OpenInNewIcon sx={{ width: 20, height: 20 }} />
        </IconButton>
          </Tooltip>
        )}
        {authorizedRoles.includes(Role.SALES_ADMIN) &&
          actions.map((action, idx) => (
            <Tooltip
              title={action.name}
              sx={{
                zIndex: 1000000,
              }}
              key={idx}
              arrow
            >
              <IconButton
                aria-label={action.name}
                onClick={action.action}
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: 6,
                  bgcolor: "transparent",
                  color: "#ff7300",
                  "& svg": {
                    fontSize: 20,
                    color: "#ff7300",
                  },
                  "&:hover": {
                    bgcolor: "rgba(255,255,255,0.14)",
                  },
                }}
              >
                {action.icon}
              </IconButton>
            </Tooltip>
          ))}
      </Stack>
    </Box>
  );
};

export default ImageSection;
