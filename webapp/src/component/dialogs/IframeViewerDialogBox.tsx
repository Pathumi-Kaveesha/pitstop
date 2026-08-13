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
import React, { useEffect, useRef } from "react";
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
import { logAnalyticsEvent } from "@slices/analyticsSlice/analytics";
import { CONTENT_STATE_IDLE, CONTENT_STATE_FAILED } from "@config/constant";
import { isGoogleDriveFolderLink } from "@utils/utils";
import { FILETYPE, CONTENT_SUBTYPE } from "@utils/types";
import { useContentTracker } from "../../hooks/useContentTracker";

export declare let _paq: unknown[];
if (typeof window !== "undefined" && typeof _paq === "undefined") {
  (window as Window & { _paq?: unknown[] })._paq = [];
}

interface ExtendedIframeViewerDialogBoxProps
  extends Omit<IframeViewerDialogBoxProps, "contentId"> {
  contentId?: number | null;
  onOpenInNewTab?: () => void;
  onPreviewReady?: () => void;
}

const extractYouTubeVideoId = (url: string): string | null => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

const IframeViewerDialogBox: React.FC<ExtendedIframeViewerDialogBoxProps> = ({
  link,
  originalUrl,
  open,
  handleClose,
  description,
  contentType,
  contentSubtype,
  contentId = null,
  onOpenInNewTab,
  onPreviewReady,
}) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const activeRequestedLinkRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const normalizedContentType = contentType?.toLowerCase() || "";
  const isYouTube =
    normalizedContentType === "youtube" ||
    contentType === FILETYPE.Youtube ||
    link?.includes("youtube.com") ||
    link?.includes("youtu.be") ||
    originalUrl?.includes("youtube.com") ||
    originalUrl?.includes("youtu.be");

  const youtubeVideoId = isYouTube
    ? extractYouTubeVideoId(link) || extractYouTubeVideoId(originalUrl)
    : null;

  const isDirectEmbeddable =
    isYouTube ||
    contentType === FILETYPE.Slide ||
    contentType === FILETYPE.GSheet ||
    contentType === FILETYPE.Youtube ||
    link?.includes("docs.google.com/presentation") ||
    link?.includes("docs.google.com/spreadsheets");

  const blockedUrls = useAppSelector((state: RootState) => state.page.blockedIframeUrls);
  const blockedUrlsState = useAppSelector((state: RootState) => state.page.blockedUrlsState);

  const { state: backendState, previewInfo } = useAppSelector(
    (state: RootState) => state.preview
  );

  const isGoogleDriveFolder = isGoogleDriveFolderLink(link);
  const isGoogleDriveFile =
    link?.includes("drive.google.com") || link?.includes("docs.google.com");

  const isLocalBlocked = isBlockedUrl(link);
  const shouldCropIframe =
    contentType === FILETYPE.External_Link &&
    (contentSubtype === CONTENT_SUBTYPE.Pdf || contentSubtype === CONTENT_SUBTYPE.Video);

  // Evaluate restricted or broken state
  const isRestrictedState =
    !isDirectEmbeddable &&
    (isGoogleDriveFolder ||
      isLocalBlocked ||
      previewInfo?.status === "RESTRICTED" ||
      (previewInfo?.status === "BROKEN" && isGoogleDriveFile));

  const isBrokenState =
    !isDirectEmbeddable &&
    ((previewInfo?.status === "BROKEN" && !isGoogleDriveFile) || backendState === "failed");

  // A preview is ONLY successful if content can actually render in the iframe
  const isPreviewSuccessful =
    isDirectEmbeddable ||
    (!isRestrictedState && !isBrokenState && previewInfo?.status === "SUCCESS");

  // Dynamically set source: "card_preview_button" when preview is valid, "card_modal_open" when invalid.
  // The backend SQL specifically looks for source LIKE '%preview%' to count previewClicks.
  const trackerSource = isPreviewSuccessful ? "card_preview_button" : "card_modal_open";

  const { onContainerMouseEnter, onContainerMouseLeave } =
    useContentTracker({
      contentId: contentId ?? null,
      contentType: contentType || "unknown",
      contentSubtype: contentSubtype || "generic",
      title: description,
      isOpen: open,
      source: trackerSource,
    });

  // Attach hover timers ONLY when preview rendering is successful (disables activeDwellSeconds on error screens)
  const handleMouseEnter = isPreviewSuccessful ? onContainerMouseEnter : undefined;
  const handleMouseLeave = isPreviewSuccessful ? onContainerMouseLeave : undefined;

  function isBlockedUrl(url: string): boolean {
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
          const pathStartIndex = trimmed.indexOf("/");

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
  }

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
      if (!isGoogleDriveFolder && !isLocalBlocked && !isDirectEmbeddable) {
        activeRequestedLinkRef.current = link;
        dispatch(verifyLinkPreview(link));
      }
    }
  }, [open, link, isGoogleDriveFolder, isLocalBlocked, isDirectEmbeddable, dispatch]);

  useEffect(() => {
    if (!open) {
      activeRequestedLinkRef.current = null;
      dispatch(resetPreviewStatus());
    }
  }, [open, dispatch]);

  useEffect(() => {
    const isCurrentRequest = activeRequestedLinkRef.current === link;
    const isBackendReady = isCurrentRequest && previewInfo?.status === "SUCCESS";

    if (
      open &&
      onPreviewReady &&
      (isDirectEmbeddable || isGoogleDriveFolder || isLocalBlocked || isBackendReady)
    ) {
      onPreviewReady();
    }
  }, [open, previewInfo?.status, link, isDirectEmbeddable, isGoogleDriveFolder, isLocalBlocked, onPreviewReady]);

  const handleOpenInNewTabClick = () => {
    // Log as ENGAGEMENT with outlink source to increment outlinkClicks without adding extra totalViews
    if (contentId) {
      dispatch(
        logAnalyticsEvent({
          eventType: "ENGAGEMENT",
          contentId: contentId,
          metadata: {
            title: description,
            source: "modal_open_in_new_tab",
            contentType: contentType || "unknown",
            contentSubtype: contentSubtype || "generic",
            verifiedView: true,
          },
        })
      );
    }

    if (onOpenInNewTab) {
      onOpenInNewTab();
    }

    window.open(originalUrl, "_blank", "noopener, noreferrer");
  };

  const renderContent = () => {
    if (!isDirectEmbeddable && backendState === "loading") {
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

    if (isRestrictedState) {
      let errorMessage =
        "This content cannot be displayed in an embedded preview. Click the button below to open it in a new window.";

      if (isGoogleDriveFolder || isGoogleDriveFile) {
        errorMessage =
          "Google Drive items cannot be previewed directly inside this embedded frame. Click the button below to safely open the resource in a new window.";
      } else if (isLocalBlocked || previewInfo?.status === "RESTRICTED") {
        errorMessage =
          "This content cannot be embedded due to security restrictions. Click the button below to open it in a new window.";
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
            onClick={handleOpenInNewTabClick}
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
          <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
            <Button
              variant="outlined"
              size="large"
              onClick={handleClose}
              sx={{
                px: 3,
                py: 1.5,
                textTransform: "none",
                fontSize: "1rem",
              }}
            >
              Go Back
            </Button>
            <Button
              variant="contained"
              size="large"
              startIcon={<OpenInNewIcon />}
              onClick={handleOpenInNewTabClick}
              sx={{
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
              Try Opening in New Window
            </Button>
          </Box>
        </Box>
      );
    }

    if (isPreviewSuccessful) {
      let finalIframeSrc = link;
      if (isYouTube && youtubeVideoId) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const urlObj = new URL(`https://www.youtube.com/embed/${youtubeVideoId}`);
        if (origin) {
          urlObj.searchParams.set("origin", origin);
        }
        finalIframeSrc = urlObj.toString();
      }

      return (
        <iframe
          id="youtube-iframe-player"
          ref={iframeRef}
          title="Content Preview"
          src={finalIframeSrc}
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
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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
              onClick={handleOpenInNewTabClick}
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