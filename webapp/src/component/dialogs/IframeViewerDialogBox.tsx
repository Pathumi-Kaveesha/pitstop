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

import { IframeViewerDialogBoxProps } from "@/types/types";
import React, { useEffect } from "react";
import {
  Dialog,
  IconButton,
  Typography,
  useTheme,
  Box,
  Button,
  CircularProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import { useAppDispatch, useAppSelector, RootState } from "@slices/store";
import { getBlockedIframeUrls } from "@slices/pageSlice/page";
import { verifyLinkPreview, resetPreviewStatus } from "@slices/previewSlice/preview";
import { CONTENT_STATE_IDLE, CONTENT_STATE_FAILED } from "@config/constant";
import { isGoogleDriveFolderLink } from "@utils/utils";
import { FILETYPE, CONTENT_SUBTYPE } from "@utils/types";

export declare let _paq: unknown[];
if (typeof window !== "undefined" && typeof _paq === "undefined") {
  (window as Window & { _paq?: unknown[] })._paq = [];
}

const IframeViewerDialogBox: React.FC<IframeViewerDialogBoxProps> = ({
  link,
  originalUrl,
  open,
  handleClose,
  description,
  contentType,
  contentSubtype,
}) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  
  const blockedUrls = useAppSelector((state: RootState) => state.page.blockedIframeUrls);
  const blockedUrlsState = useAppSelector((state: RootState) => state.page.blockedUrlsState);
  
  const { state: backendState, previewInfo } = useAppSelector(
    (state: RootState) => state.preview
  );

  const isBlockedUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;
      
      return blockedUrls.some((blockedUrl: string) => {
        let blockedHostname: string;
        let blockedPath: string | null = null;
        
        try {
          const blockedUrlObj = new URL(blockedUrl);
          blockedHostname = blockedUrlObj.hostname;
          blockedPath = blockedUrlObj.pathname;
        } catch {
          const trimmed = blockedUrl.trim();
          const pathStartIndex = trimmed.indexOf('/');
          
          if (pathStartIndex > 0) {
            blockedHostname = trimmed.substring(0, pathStartIndex);
            blockedPath = trimmed.substring(pathStartIndex);
          } else {
            blockedHostname = trimmed;
          }
        }
        
        const hostnameMatches = 
          hostname === blockedHostname ||
          hostname.endsWith(`.${blockedHostname}`);
        
        if (!hostnameMatches) {
          return false;
        }
        
        if (blockedPath && blockedPath !== "/") {
          const normalizedBlockedPath =
            blockedPath.endsWith("/") && blockedPath.length > 1
              ? blockedPath.slice(0, -1)
              : blockedPath;
          const normalizedPathname =
            pathname.endsWith("/") && pathname.length > 1
              ? pathname.slice(0, -1)
              : pathname;
          return (
            normalizedPathname === normalizedBlockedPath ||
            normalizedPathname.startsWith(`${normalizedBlockedPath}/`)
          );
        }
        
        return true;
      });
    } catch {
      return blockedUrls.some((blockedUrl: string) => url.includes(blockedUrl));
    }
  };

  const isGoogleDriveFolder = isGoogleDriveFolderLink(link);
  const isLocalBlocked = isBlockedUrl(link);
  const shouldCropIframe = contentType === FILETYPE.External_Link && (contentSubtype === CONTENT_SUBTYPE.Pdf || contentSubtype === CONTENT_SUBTYPE.Video);

  useEffect(() => {
    if (
      blockedUrlsState === CONTENT_STATE_IDLE ||
      blockedUrlsState === CONTENT_STATE_FAILED
    ) {
      dispatch(getBlockedIframeUrls());
    }
  }, [dispatch, blockedUrlsState]);

  useEffect(() => {
    if (open && link) {
      if (!isGoogleDriveFolder && !isLocalBlocked) {
        dispatch(verifyLinkPreview(link));
      }
    }
  }, [open, link, isGoogleDriveFolder, isLocalBlocked, dispatch]);

  useEffect(() => {
    if (!open) {
      dispatch(resetPreviewStatus());
    }
  }, [open, dispatch]);

  const handleOpenInNewTab = () => {
    window.open(originalUrl, "_blank", "noopener, noreferrer");
  };

  const renderContent = () => {
    if (backendState === "loading") {
      return (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.palette.background.default,
            zIndex: 10,
          }}
        >
          <CircularProgress />
        </Box>
      );
    }

    const isGoogleDriveFile = link?.includes("drive.google.com");

    // Path A: The URL is live, but framing is restricted by rules or security protections (including file storage wrappers)
    const isRestrictedState = 
      isGoogleDriveFolder || 
      isLocalBlocked || 
      previewInfo?.status === "RESTRICTED" ||
      (previewInfo?.status === "BROKEN" && isGoogleDriveFile);

    if (isRestrictedState) {
      let errorMessage = "This content cannot be displayed in an embedded preview. Click the button below to open it in a new window.";
      
      if (isGoogleDriveFolder || isGoogleDriveFile) {
        errorMessage = "Google Drive items cannot be previewed directly inside this embedded frame. Click the button below to safely open the resource in a new window.";
      } else if (isLocalBlocked || previewInfo?.status === "RESTRICTED") {
        errorMessage = "This content cannot be embedded due to security restrictions. Click the button below to open it in a new window.";
      }

      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 3,
            padding: 4,
            textAlign: "center",
          }}
        >
          <ErrorOutlineIcon
            sx={{
              fontSize: 64,
              color: theme.palette.warning.main,
            }}
          />
          <Typography
            variant="h6"
            sx={{
              color: theme.palette.text.primary,
              fontWeight: 500,
            }}
          >
            Can't open in preview
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.text.secondary,
              maxWidth: "400px",
            }}
          >
            {errorMessage}
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<OpenInNewIcon />}
            onClick={handleOpenInNewTab}
            sx={{
              mt: 2,
              px: 4,
              py: 1.5,
              textTransform: "none",
              fontSize: "1rem",
              color: theme.palette.common.white,
            }}
          >
            Open in New Window
          </Button>
        </Box>
      );
    }

    // Path B: The URL link layout is entirely dead or invalid (excluding structural file configurations)
    const isBrokenState = (previewInfo?.status === "BROKEN" && !isGoogleDriveFile) || backendState === "failed";
    if (isBrokenState) {
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 3,
            padding: 4,
            textAlign: "center",
          }}
        >
          <LinkOffIcon
            sx={{
              fontSize: 64,
              color: theme.palette.error.main,
            }}
          />
          <Typography
            variant="h6"
            sx={{
              color: theme.palette.text.primary,
              fontWeight: 500,
            }}
          >
            Link can't be opened
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.text.secondary,
              maxWidth: "400px",
            }}
          >
            This link looks broken or the site is temporarily unavailable. Please check the URL and try again.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={handleClose}
            sx={{
              mt: 2,
              px: 4,
              py: 1.5,
              textTransform: "none",
              fontSize: "1rem",
              backgroundColor: theme.palette.error.main,
              color: theme.palette.common.white,
              "&:hover": {
                backgroundColor: theme.palette.error.dark,
              },
            }}
          >
            Go Back
          </Button>
        </Box>
      );
    }

    // Path C: The validation succeeded cleanly
    if (previewInfo?.status === "SUCCESS") {
      return (
        <iframe
          title="Content Preview"
          src={link}
          sandbox="allow-same-origin allow-scripts allow-presentation allow-forms"
          style={{
            border: "none",
            display: "block",
            width: shouldCropIframe ? "110%" : "100%",
            height: "100%",
            position: "absolute",
            top: 0,
            left: shouldCropIframe ? "-5%" : 0,
          }}
        />
      );
    }

    return null;
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          backgroundColor: "transparent",
          boxShadow: "none",
          overflow: "visible",
        },
      }}
    >
      <Box
        sx={{
          position: "relative",
          backgroundColor: theme.palette.background.paper,
          borderRadius: "12px",
          width: "90vw",
          maxWidth: "1200px",
          height: "80vh",
          maxHeight: "800px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: theme.spacing(2),
            borderBottom: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.grey[900],
          }}
        >
          <Typography
            variant="h6"
            sx={{
              color: theme.palette.grey[100],
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              mr: 2,
            }}
          >
            {description || "Content Preview"}
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <IconButton
              onClick={handleOpenInNewTab}
              sx={{ color: theme.palette.grey[100] }}
              aria-label="open in new tab"
              title="Open in new tab"
            >
              <OpenInNewIcon />
            </IconButton>
            <IconButton
              onClick={handleClose}
              sx={{ color: theme.palette.grey[100] }}
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        <Box
          sx={{
            flex: 1,
            width: "100%",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {renderContent()}
        </Box>
      </Box>
    </Dialog>
  );
};

export default IframeViewerDialogBox;