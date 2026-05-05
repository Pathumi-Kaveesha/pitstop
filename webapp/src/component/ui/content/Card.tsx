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

import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import UpdateIcon from "@mui/icons-material/Update";
import {
  Box,
  Button,
  CardMedia,
  Divider,
  Fade,
  Grow,
  Menu,
  MenuItem,
  Modal,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import IconButton from "@mui/material/IconButton";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useLocation, useNavigate } from "react-router-dom";
import { CustomButton, CustomTheme } from "src/types/types";

import wso2LogoWhite from "@assets/images/wso2-logo-white.png";
import { GOOGLE_DOCS_DOMAIN, GOOGLE_DRIVE_DOMAIN } from "@config/constant";
import { RootState, useAppDispatch, useAppSelector } from "@slices/store";
import { safeParseHtml } from "@utils/safeHtml";

import DeleteDialogBox from "@components/dialogs/DeleteDialogBox";
import IframeViewerDialogBox from "@components/dialogs/IframeViewerDialogBox";
import { enqueueSnackbarMessage } from "@slices/commonSlice/common";
import {
  createCustomButton,
  deleteCustomButton,
  getCustomButtons,
  updateCustomButton,
} from "@slices/customButtonSlice/customButton";
import {
  getAllComments,
  getLikes,
  likeContent,
  pinContent,
  unpinContent,
  updateContent,
} from "@slices/pageSlice/page";
import { CONTENT_SUBTYPE, FILETYPE, Role } from "@utils/types";
import { getEmbedUrl, getGoogleDocsDownloadUrl } from "@utils/utils";
import UpdateContentDialogBox from "@components/dialogs/ContentDialogBox";
import CustomButtonConfigDialog from "@components/dialogs/CustomButtonConfigDialog";
import ExpandedContentCard from "./ExpandedContent";
import CardCustomButtons from "./CardCustomButtons";
import CardTitle from "./CardTitle";
import CardNote from "./CardNote";
import CardTags from "./CardTags";
import LikesModal from "./LikesModal";

interface ComponentCardProps {
  contentId: number;
  contentLink: string;
  contentType: string;
  contentSubtype?: CONTENT_SUBTYPE;
  description: string;
  thumbnail?: string;
  note?: string;
  customContentTheme?: CustomTheme;
  contentOrder: number;
  likesCount: number;
  sectionId: number;
  status?: boolean;
  commentCount: number;
  isExpanded?: boolean;
  createdOn: string;
  contentIndex?: number;
  tags: string[];
  customButtons?: CustomButton[];
  isInPinnedSection?: boolean;
  onContentUnpinned?: (contentId: number) => void;
  isVisible?: boolean;
  isReused?: boolean;
}

export declare let _paq: unknown[];
if (typeof window !== "undefined" && typeof _paq === "undefined") {
  (window as unknown as { _paq: unknown[] })._paq = [];
}

const PREVIEW_W = 323;
const PREVIEW_H = 220;
const CARD_W = 399;
const CARD_H = 424;

const ComponentCard = ({
  contentId,
  contentLink,
  contentType,
  contentSubtype,
  description,
  likesCount: initialLikesCount,
  sectionId,
  status,
  thumbnail,
  note,
  customContentTheme,
  contentOrder,
  commentCount,
  isExpanded,
  createdOn,
  contentIndex,
  tags,
  customButtons = [],
  isVisible = true,
  isReused,
  onContentUnpinned,
  isInPinnedSection,
}: ComponentCardProps) => {
  const authorizedRoles: Role[] = useAppSelector((state: RootState) => state.auth.roles);
  const location = useLocation();
  const [like, setLike] = useState(status);
  const [localLikesCount, setLocalLikesCount] = useState(initialLikesCount);
  const pinnedContentIds = useAppSelector((state: RootState) => state.page.pinnedContentIds);
  const isPinned = pinnedContentIds.includes(contentId);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isCommentDrawerOpen, setIsCommentDrawerOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isCustomButtonDialogOpen, setIsCustomButtonDialogOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [imageError, setImageError] = useState(false);
  const [isLikesModalOpen, setIsLikesModalOpen] = useState(false);
  const likes = useAppSelector(
    (state: RootState) => state.page.likes[contentId] || []
  );
  const isMenuItemsOpen = Boolean(anchorEl);
  const liked = useAppSelector((state: RootState) => state.page.likeState);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const theme = useTheme();

  const urlCheckDone = useRef(false);
  const [urlProcessed, setUrlProcessed] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const contentBodyRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isOverflowExpanded, setIsOverflowExpanded] = useState(false);

  const toggleInfoModal = () => {
    setIsInfoModalOpen((prev) => !prev);
  };

  const handleCustomButtonAction = (button: CustomButton) => {
    if (window.config?.IS_MATOMO_ENABLED) {
      _paq.push([
        "trackEvent",
        "User Interaction",
        "Custom Button Click",
        `Button: ${button.label}`,
      ]);
    }
    switch (button.action) {
      case "link":
        if (button.actionValue) {
          window.open(button.actionValue, "_blank");
        }
        break;
      case "download":
        if (button.actionValue) {
          try {
            const isGoogleUrl =
              button.actionValue.includes(GOOGLE_DOCS_DOMAIN) ||
              button.actionValue.includes(GOOGLE_DRIVE_DOMAIN);
            const downloadUrl = isGoogleUrl
              ? getGoogleDocsDownloadUrl(button.actionValue)
              : button.actionValue;
            if (isGoogleUrl) {
              window.open(downloadUrl, "_blank");
            } else {
              const link = document.createElement("a");
              link.href = downloadUrl;
              link.download = downloadUrl.split("/").pop() || "download";
              link.target = "_blank";
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }
          } catch (error) {
            console.error("Download failed:", error);
            window.open(button.actionValue, "_blank");
          }
        }
        break;
      default:
        break;
    }
  };
  const customButtonsFromStore = useAppSelector(
    (state: RootState) => state.customButton.buttonsByContentId[contentId.toString()] || [],
  );

  const [localCustomButtons, setLocalCustomButtons] =
    useState<CustomButton[]>(customButtonsFromStore);
  const [localIsVisible, setLocalIsVisible] = useState(isVisible);

  useEffect(() => {
    setLocalIsVisible(isVisible);
  }, [isVisible]);

  useEffect(() => {
    if (contentId) {
      dispatch(getCustomButtons(contentId.toString()));
    }
  }, [contentId, dispatch]);

  useEffect(() => {
    setLocalCustomButtons(customButtonsFromStore);
  }, [customButtonsFromStore]);

  useEffect(() => {
    const el = contentBodyRef.current;
    if (!el) return;
    const detect = () => setHasOverflow(el.scrollHeight > el.clientHeight + 2);
    detect();
    const ro = new ResizeObserver(detect);
    ro.observe(el);
    return () => ro.disconnect();
  }, [description, createdOn, customContentTheme, note, tags, localCustomButtons, localIsVisible]);

  const [likesLoaded, setLikesLoaded] = useState(false);

  useEffect(() => {
    if (contentId && !likesLoaded) {
      dispatch(getLikes({ contentId }));
      setLikesLoaded(true);
    }
  }, [contentId, likesLoaded, dispatch]);

  const fetchLikesIfNeeded = useCallback(() => {
    if (!likes || likes.length === 0) {
      dispatch(getLikes({ contentId }));
    }
  }, [likes, contentId, dispatch]);

  const handleSaveCustomButtons = async (buttons: CustomButton[]) => {
    const reorderedButtons = buttons.map((button, index) => ({
      ...button,
      order: index,
    }));

    setLocalCustomButtons(reorderedButtons);
    setIsCustomButtonDialogOpen(false);

    const originalButtonIds = customButtonsFromStore.map((btn) => btn.id);
    const newButtonIds = buttons.map((btn) => btn.id).filter((id) => id > 0);
    const deletedButtonIds = originalButtonIds.filter((id) => !newButtonIds.includes(id));

    const newButtons = reorderedButtons.filter((btn) => btn.id < 0);
    const existingButtons = reorderedButtons.filter((btn) => btn.id > 0);
    const buttonsToUpdate = existingButtons.filter((btn) => {
      const original = customButtonsFromStore.find((orig) => orig.id === btn.id);
      return (
        original &&
        (original.label !== btn.label ||
          original.description !== btn.description ||
          original.icon !== btn.icon ||
          original.color !== btn.color ||
          original.action !== btn.action ||
          original.actionValue !== btn.actionValue ||
          original.isVisible !== btn.isVisible ||
          original.order !== btn.order)
      );
    });

    let hasOperations = false;
    let operationType = "";

    if (deletedButtonIds.length > 0) {
      hasOperations = true;
      operationType = "delete";
      for (const buttonId of deletedButtonIds) {
        await dispatch(deleteCustomButton({ buttonId, showNotification: false })).unwrap();
      }
    }

    if (newButtons.length > 0) {
      hasOperations = true;
      if (!operationType) operationType = "create";
      else if (operationType !== "create") operationType = "mixed";

      for (let index = 0; index < newButtons.length; index++) {
        const button = newButtons[index];

        const buttonToSave = {
          ...button,
          contentId: contentId.toString(),
          order: reorderedButtons.findIndex((btn) => btn === button),
          description: button.description?.trim() || "",
          icon: button.icon || null,
          color: button.color || "orange",
          isVisible: button.isVisible !== false,
        };

        if (!buttonToSave.contentId || !buttonToSave.action || !buttonToSave.actionValue?.trim()) {
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _, ...newButtonData } = buttonToSave;
        await dispatch(
          createCustomButton({ button: newButtonData, showNotification: false }),
        ).unwrap();

        if (index < newButtons.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    if (buttonsToUpdate.length > 0) {
      hasOperations = true;
      if (!operationType) operationType = "update";
      else if (operationType !== "update") operationType = "mixed";
      for (const button of buttonsToUpdate) {
        const buttonToSave = {
          ...button,
          contentId: contentId.toString(),
          order: reorderedButtons.findIndex((btn) => btn.id === button.id),
          label: button.label?.trim() || "",
          description: button.description?.trim() || "",
          icon: button.icon || null,
          color: button.color || "orange",
          isVisible: button.isVisible !== false,
        };

        if (!buttonToSave.contentId || !buttonToSave.action || !buttonToSave.actionValue?.trim()) {
          continue;
        }
        await dispatch(
          updateCustomButton({ button: buttonToSave, showNotification: false }),
        ).unwrap();
      }
    }
    if (hasOperations) {
      let message = "";
      switch (operationType) {
        case "create":
          message =
            newButtons.length === 1
              ? "Custom button created successfully"
              : "Custom buttons created successfully";
          break;
        case "update":
          message =
            buttonsToUpdate.length === 1
              ? "Custom button updated successfully"
              : "Custom buttons updated successfully";
          break;
        case "delete":
          message =
            deletedButtonIds.length === 1
              ? "Custom button deleted successfully"
              : "Custom buttons deleted successfully";
          break;
        case "mixed":
          message = "Custom buttons saved successfully";
          break;
        default:
          message = "Custom buttons saved successfully";
      }

      dispatch(
        enqueueSnackbarMessage({
          message,
          type: "success",
          anchorOrigin: {
            vertical: "bottom",
            horizontal: "right",
          },
        }),
      );
      setTimeout(() => {
        dispatch(getCustomButtons(contentId.toString()));
      }, 300);
    }
  };

  const commentDrawerHandler = () => {
    setIsCommentDrawerOpen(true);
    dispatch(getAllComments({ contentId }));

    const currentSearch = new URLSearchParams(location.search);
    currentSearch.set("sectionId", sectionId.toString());
    currentSearch.set("contentId", contentId.toString());

    const newUrl = `${location.pathname}?${currentSearch.toString()}`;
    navigate(newUrl, { replace: true });
  };

  const closeCommentDrawer = () => {
    setIsCommentDrawerOpen(false);
    urlCheckDone.current = false;
    setUrlProcessed(false);
    const currentSearch = new URLSearchParams(location.search);
    currentSearch.delete("sectionId");
    currentSearch.delete("contentId");
    const searchString = currentSearch.toString();
    const newUrl = location.pathname + (searchString ? `?${searchString}` : "");

    navigate(newUrl, { replace: true });
  };

  const getCommentDialogFromUrl = useCallback((): {
    shouldOpenComments: boolean;
    contentId: number | null;
  } => {
    const urlParams = new URLSearchParams(window.location.search);
    const contentIdParam = urlParams.get("contentId");
    const sectionIdParam = urlParams.get("sectionId");
    const contentId = contentIdParam ? parseInt(contentIdParam, 10) : null;
    const urlSectionId = sectionIdParam ? parseInt(sectionIdParam, 10) : null;

    return {
      shouldOpenComments: contentId !== null && urlSectionId === sectionId && !urlProcessed,
      contentId: contentId && !isNaN(contentId) ? contentId : null,
    };
  }, [sectionId, urlProcessed]);

  useEffect(() => {
    if (!isExpanded) {
      const { shouldOpenComments, contentId: urlContentId } = getCommentDialogFromUrl();

      if (shouldOpenComments && urlContentId === contentId && !urlCheckDone.current) {
        setIsCommentDrawerOpen(true);
        dispatch(getAllComments({ contentId }));
        urlCheckDone.current = true;
        setUrlProcessed(true);
      }
    }
  }, [contentId, dispatch, isExpanded, getCommentDialogFromUrl]);

  const toggleLike = () => {
    dispatch(likeContent({ contentId }));
    if (liked !== "failed") {
      setLike((prev) => {
        const next = !prev;

        setLocalLikesCount((c) => (next ? c + 1 : c - 1));
        if (window.config?.IS_MATOMO_ENABLED) {
          _paq.push([
            "trackEvent",
            "User Interaction",
            next ? "Like" : "Unlike",
            `Content : ${description}`,
          ]);
        }
        return next;
      });
      setTimeout(() => {
        dispatch(getLikes({ contentId }));
      }, 300);
    }
  };

  const togglePin = () => {
    const action = isPinned ? unpinContent({ contentId }) : pinContent({ contentId });

    dispatch(action)
      .unwrap()
      .then(() => {
        if (isPinned && isInPinnedSection) {
          onContentUnpinned?.(contentId);
        }

        if (window.config?.IS_MATOMO_ENABLED) {
          _paq.push([
            "trackEvent",
            "User Interaction",
            isPinned ? "Unpin Content" : "Pin Content",
            `Content : ${description}`,
          ]);
        }
      })
      .catch(() => {
        dispatch(
          enqueueSnackbarMessage({
            message: isPinned
              ? "Failed to unpin content. Please try again."
              : "Failed to pin content. Please try again.",
            type: "error",
            anchorOrigin: {
              vertical: "bottom",
              horizontal: "right",
            },
          }),
        );
      });
  };

  const toggleVisibility = () => {
    const newVisibility = !localIsVisible;
    setLocalIsVisible(newVisibility);
    dispatch(
      updateContent({
        contentId,
        content: {
          isVisible: newVisibility,
          reorderContents: []
        },
        routePath: location.pathname,
      }),
    )
      .unwrap()
      .catch(() => {
        setLocalIsVisible(!newVisibility);
        dispatch(
          enqueueSnackbarMessage({
            message: "Failed to update content visibility",
            type: "error",
            anchorOrigin: {
              vertical: "bottom",
              horizontal: "right",
            },
          }),
        );
      });
  };

  const getCardContentOrder = (): string[] => {
    const defaultOrder = ["customButtons", "title", "note", "tags"];
    try {
      const configuredOrder = window.config?.CARD_CONTENT_ORDER;
      if (Array.isArray(configuredOrder)) {
        const allowed = new Set(defaultOrder);
        const normalized = configuredOrder.filter((section) => allowed.has(section));
        return [...new Set([...normalized, ...defaultOrder])];
      }
    } catch (error) {
      console.warn("Error reading CARD_CONTENT_ORDER from config:", error);
    }
    return defaultOrder;
  };

  const renderContentSection = (sectionName: string, hasVisibleCustomButtons: boolean) => {
    switch (sectionName) {
      case "customButtons":
        return (
          <CardCustomButtons
            key="customButtons"
            buttons={localCustomButtons}
            isVisible={localIsVisible}
            hasVisibleCustomButtons={hasVisibleCustomButtons}
            onButtonAction={handleCustomButtonAction}
          />
        );
      case "title":
        return (
          <CardTitle
            key="title"
            description={description}
            createdOn={createdOn}
            customContentTheme={customContentTheme}
            hasVisibleCustomButtons={hasVisibleCustomButtons}
            isVisible={localIsVisible}
            authorizedRoles={authorizedRoles}
            onMoreClick={(e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
            onVisibilityToggle={toggleVisibility}
          />
        );
      case "note":
        if (!note?.trim() && !customContentTheme?.note?.htmlContent?.trim()) return null;
        return (
          <Box
            key="note"
            sx={{
              px: 2.5,
              pt: hasVisibleCustomButtons ? 1.5 : 2.5,
              pb: 0,
            }}
          >
            <CardNote
              note={note}
              customContentTheme={customContentTheme}
              onReadMore={toggleInfoModal}
            />
          </Box>
        );
      case "tags":
        if (!tags?.some((tag) => tag.trim())) return null;
        return (
          <Box
            key="tags"
            sx={{
              px: 2.5,
              pt: hasVisibleCustomButtons ? 1.5 : 2.5,
              pb: 0,
            }}
          >
            <CardTags tags={tags} />
          </Box>
        );
      default:
        return null;
    }
  };

  const shouldShowIframe = () => {
    if (contentType === FILETYPE.External_Link) {
      return contentSubtype && contentSubtype !== CONTENT_SUBTYPE.Generic;
    }
    return [FILETYPE.Slide, FILETYPE.GSheet, FILETYPE.Youtube].includes(contentType as FILETYPE);
  };

  const renderOverlaySection = (sectionName: string) => {
    const hasVisibleCustomButtons = (localCustomButtons || []).some((b) => b.isVisible) && localIsVisible;
    
    switch (sectionName) {
      case "title": {
        return (
          <CardTitle
            key="title-overlay"
            description={description}
            createdOn={createdOn}
            customContentTheme={customContentTheme}
            hasVisibleCustomButtons={hasVisibleCustomButtons}
            isVisible={localIsVisible}
            authorizedRoles={authorizedRoles}
            onMoreClick={(e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
            onVisibilityToggle={toggleVisibility}
            isInOverlay={true}
          />
        );
      }
      case "customButtons": {
        if (!localCustomButtons || localCustomButtons.length === 0) return null;
        const visibleButtons = localCustomButtons.filter((b) => b.isVisible);
        if (visibleButtons.length === 0) return null;
        return (
          <Box key="customButtons-overlay" sx={{ mb: 1.5, px: 2 }}>
            <CardCustomButtons
              buttons={localCustomButtons}
              isVisible={localIsVisible}
              hasVisibleCustomButtons={true}
              onButtonAction={handleCustomButtonAction}
              isInOverlay={true}
            />
          </Box>
        );
      }
      case "note": {
        if (!note?.trim() && !customContentTheme?.note?.htmlContent?.trim()) return null;
        return (
          <CardNote
            key="note-overlay"
            note={note}
            customContentTheme={customContentTheme}
            onReadMore={() => setIsOverflowExpanded((prev) => !prev)}
            isInOverlay={true}
          />
        );
      }
      case "tags": {
        if (!tags?.filter((t) => t.trim()).length) return null;
        return <CardTags key="tags-overlay" tags={tags} isInOverlay={true} />;
      }
      default:
        return null;
    }
  };

  const shouldShowWSO2Placeholder = () => {
    if (contentType === FILETYPE.External_Link) {
      return !contentSubtype || contentSubtype === CONTENT_SUBTYPE.Generic;
    }
    return [FILETYPE.Salesforce, FILETYPE.Lms].includes(contentType as FILETYPE);
  };

  const getEmbedContent = () => {
    const embedUrl = getEmbedUrl(contentType as FILETYPE, contentLink, contentSubtype);

    const isGoogleDrivePdf =
      contentType === FILETYPE.External_Link &&
      contentSubtype === CONTENT_SUBTYPE.Pdf &&
      (embedUrl.includes("drive.google.com"));

    return (
      <Box 
        sx={{ 
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%", 
          height: "100%"
          }}
      >
        <iframe
          title="Content Viewer"
          src={embedUrl}
          width={`${PREVIEW_W}px`}
          height={`${PREVIEW_H}px`}
          sandbox="allow-same-origin allow-scripts allow-presentation allow-popups"
          style={{
            ...(isGoogleDrivePdf
              ? {
                  position: "absolute",
                  width: "120%",
                  height: "140%", 
                  top: "-45px",
                  left: "-10%",
                } 
              : {
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }
            ),

            ...(authorizedRoles.includes(Role.SALES_ADMIN) && !localIsVisible
              ? {
                  opacity: 0.6,
                  filter: "grayscale(80%) blur(0.5px)",
                }
              : {}),
          }}
        />
      </Box>
    );
  };

  return (
    <Grow
      in
      style={{ transformOrigin: "0 0 0" }}
      {...(contentIndex ? { timeout: contentIndex * 200 } : {})}
    >
      <Card
        ref={cardRef}
        elevation={3}
        sx={{
          mx: 1.25,
          my: 1.25,
          width: `${CARD_W}px`,
          height: `${CARD_H}px`,
          borderRadius: 10,
          position: "relative",
          overflow: "visible",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#14151be3",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          cursor: "pointer",
          transition: "all 0.3s ease-out",
          "&:hover": {
            transform: "translateY(-16px)",
            boxShadow: "0 40px 100px rgba(0,0,0,0.8)",
            "& .card-media": {
              transform: "translateX(-50%) translateY(-6px) scale(1.02)",
              boxShadow: "0 25px 60px rgba(0,0,0,0.8)",
            },
            "& .pin-button": {
              transform: "scale(1.1)",
            },
            "& .card-content": {
              transform: "translateY(-2px)",
            },
          },
          ...(authorizedRoles.includes(Role.SALES_ADMIN) && !localIsVisible
            ? {
                backgroundColor: "rgba(42, 45, 58, 0.4)",
                border: "2px dashed rgba(255,255,255,0.2)",
              }
            : {}),
        }}
      >
        {localIsVisible && (
          <IconButton
            aria-label={isPinned ? "Unpin this content" : "Pin this content"}
            onClick={togglePin}
            className="pin-button"
            sx={{
              position: "absolute",
              bottom: 16,
              right: 16,
              zIndex: 10,
              color: isPinned ? "#fe9c33ff" : "rgba(255,255,255,0.7)",
              backgroundColor: "rgba(42,45,58,0.8)",
              backdropFilter: "blur(10px)",
              transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
              "&:hover": {
                backgroundColor: "rgba(42,45,58,0.95)",
                color: "#ffd700",
              },
            }}
            size="small"
          >
            {isPinned ? <PushPinIcon /> : <PushPinOutlinedIcon />}
          </IconButton>
        )}

        <CardMedia
          className="card-media"
          sx={{
            position: "absolute",
            top: -30,
            left: "50%",
            transform: "translateX(-50%)",
            width: `${PREVIEW_W}px`,
            height: `${PREVIEW_H}px`,
            borderRadius: 4,
            overflow: "hidden",
            boxShadow: `0 15px 40px ${theme.palette.common.black}`,
            zIndex: 3,
            background: theme.palette.common.black,
            border: `1px solid ${theme.palette.primary.main}`,
            transition: "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
            '& iframe': {
              display: 'block',
              border: 'none',
              margin: 0,
              padding: 0,
              width: '100%',
              height: '100%',
            },
            ...(authorizedRoles.includes(Role.SALES_ADMIN) && !localIsVisible
              ? {
                  opacity: 0.7,
                  filter: "grayscale(60%) blur(1px)",
                  background: "rgba(45, 45, 45, 0.5)",
                  "&::after": {
                    content: '""',
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    pointerEvents: "none",
                  },
                }
              : {}),
          }}
        >
          {(([
            FILETYPE.External_Link,
            FILETYPE.Salesforce,
            FILETYPE.Youtube,
            FILETYPE.Slide,
            FILETYPE.Lms,
            FILETYPE.GSheet,
          ].includes(contentType as FILETYPE) &&
            !(
              contentType === FILETYPE.External_Link && contentSubtype === CONTENT_SUBTYPE.Video
            )) ||
            thumbnail) && (
            <Box sx={{ position: "absolute", top: 12, right: 12, zIndex: 20 }}>
              <Tooltip title="Open preview" arrow>
                <IconButton
                  size="small"
                  aria-label="open-preview-modal"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPreviewModalOpen(true);
                    if (window.config?.IS_MATOMO_ENABLED) {
                      _paq.push([
                        "trackEvent",
                        "User Interaction",
                        "Preview Click",
                        `Content: ${description}`,
                      ]);
                    }
                  }}
                  sx={{
                    color: theme.palette.common.white,
                    backgroundColor: "rgba(60, 60, 60, 0.6)",
                    backdropFilter: "blur(10px)",
                    "&:hover": { backgroundColor: "rgba(80, 80, 80, 0.9)" },
                  }}
                >
                  <OpenInNewIcon sx={{ width: 18, height: 18 }} />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          {!thumbnail ? (
            shouldShowWSO2Placeholder() ? (
              <Box
                display="flex"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                height="100%"
                gap={0.5}
                sx={{
                  ...(authorizedRoles.includes(Role.SALES_ADMIN) && !localIsVisible
                    ? {
                        opacity: 0.7,
                        filter: "grayscale(80%)",
                      }
                    : {}),
                }}
              >
                <img alt="logo" width="48" height="auto" src={wso2LogoWhite} />
                <Typography
                  variant="caption"
                  sx={{
                    color: theme.palette.common.white,
                    textAlign: "center",
                    fontSize: 18,
                    fontWeight: 600,
                    ...(authorizedRoles.includes(Role.SALES_ADMIN) && !localIsVisible
                      ? {
                          color: "rgba(255,255,255,0.6)",
                        }
                      : {}),
                  }}
                >
                  {window.config?.APP_DETAILS?.NAME}
                </Typography>
              </Box>
            ) : shouldShowIframe() ? (
              getEmbedContent()
            ) : null
          ) : (
            <Box
              sx={{
                position: "relative",
                width: "100%",
                height: "100%",
                ...(authorizedRoles.includes(Role.SALES_ADMIN) && !localIsVisible
                  ? {
                      "&::after": {
                        content: '"HIDDEN"',
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        color: "rgba(255,255,255,0.9)",
                        fontSize: "0.7rem",
                        fontWeight: "bold",
                        backgroundColor: "rgba(0,0,0,0.6)",
                        padding: "3px 6px",
                        borderRadius: "3px",
                        zIndex: 10,
                        textAlign: "center",
                        border: "1px solid rgba(255,255,255,0.3)",
                      },
                    }
                  : {}),
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url(${thumbnail})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter:
                    authorizedRoles.includes(Role.SALES_ADMIN) && !localIsVisible
                      ? "blur(4px) grayscale(70%)"
                      : "blur(5px)",
                  transform: "scale(1.1)",
                  opacity:
                    authorizedRoles.includes(Role.SALES_ADMIN) && !localIsVisible ? 0.5 : 0.7,
                }}
              />
              <Box
                sx={{
                  position: "relative",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {imageError ? (
                  <Box
                    display="flex"
                    flexDirection="column"
                    justifyContent="center"
                    alignItems="center"
                    height="100%"
                    width="100%"
                    sx={{
                      backgroundColor: "rgba(0,0,0,0.08)",
                      ...(authorizedRoles.includes(Role.SALES_ADMIN) && !localIsVisible
                        ? {
                            opacity: 0.7,
                            filter: "grayscale(80%)",
                          }
                        : {}),
                    }}
                  >
                    <BrokenImageIcon
                      sx={{
                        fontSize: 22,
                        color:
                          authorizedRoles.includes(Role.SALES_ADMIN) && !localIsVisible
                            ? "rgba(255,255,255,0.5)"
                            : "text.secondary",
                      }}
                    />
                    <Typography
                      variant="caption"
                      color={
                        authorizedRoles.includes(Role.SALES_ADMIN) && !localIsVisible
                          ? "rgba(255,255,255,0.5)"
                          : "text.secondary"
                      }
                      sx={{ mt: 0.5, fontSize: 10 }}
                    >
                      Unable to load image
                    </Typography>
                  </Box>
                ) : (
                  <img
                    src={thumbnail}
                    alt="thumbnail"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      position: "relative",
                      ...(authorizedRoles.includes(Role.SALES_ADMIN) && !localIsVisible
                        ? {
                            opacity: 0.6,
                            filter: "grayscale(70%)",
                          }
                        : {}),
                    }}
                    onError={() => setImageError(true)}
                  />
                )}
              </Box>
            </Box>
          )}

          <Menu
            elevation={theme.palette.mode === "light" ? 6 : 0}
            id="long-menu"
            MenuListProps={{ "aria-labelledby": "long-button" }}
            open={isMenuItemsOpen}
            anchorEl={anchorEl}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            sx={{ ml: 3 }}
            onClose={() => setAnchorEl(null)}
          >
            <MenuItem
              key={"update"}
              onClick={() => setIsUpdateDialogOpen(true)}
              sx={{ minWidth: 140 }}
            >
              <UpdateIcon sx={{ mr: 1 }} />
              <Typography>Update</Typography>
            </MenuItem>
            <MenuItem
              key={"delete"}
              onClick={() => setIsDeleteDialogOpen(true)}
              sx={{ minWidth: 140 }}
            >
              <DeleteIcon sx={{ mr: 1 }} />
              <Typography>Delete</Typography>
            </MenuItem>
          </Menu>
        </CardMedia>

        <Box
          className="card-content"
          sx={{
            mt: `${PREVIEW_H - 30}px`,
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            height: `calc(${CARD_H}px - ${PREVIEW_H - 30}px)`,
            overflow: "hidden",
            position: "relative",
            zIndex: 2,
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            ...(isOverflowExpanded ? { filter: "blur(3px)", pointerEvents: "none" } : {}),
          }}
        >
          {(() => {
            const hasVisibleCustomButtons = (localCustomButtons || []).some((b) => b.isVisible) && localIsVisible;
            const contentOrder = getCardContentOrder();

            return (
              <>
                {/*for scroll detection*/}
                <Box
                  ref={contentBodyRef}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    flexGrow: 1,
                    overflow: "hidden",
                    position: "relative",
                    minHeight: 0,
                    ...(hasOverflow && !isOverflowExpanded
                      ? { maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)" }
                      : {}),
                  }}
                >
                  {contentOrder.map((sectionName) => renderContentSection(sectionName, hasVisibleCustomButtons))}
                </Box>

                {hasVisibleCustomButtons && (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 0.25, flexShrink: 0 }}>
                    {hasOverflow && (
                      <IconButton
                        aria-label={isOverflowExpanded ? "Collapse content" : "Expand content"}
                        aria-expanded={isOverflowExpanded}
                        aria-controls={`card-overflow-content-${contentId}`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => setIsOverflowExpanded((prev) => !prev)}
                        sx={{
                          color: "rgba(255,255,255,0.8)",
                          p: 0.75,
                          backgroundColor: "rgba(255,255,255,0.12)",
                          border: "1px solid rgba(255,255,255,0.25)",
                          transition: "transform 0.3s ease, color 0.2s ease, background-color 0.2s ease",
                          transform: isOverflowExpanded ? "rotate(180deg)" : "rotate(0deg)",
                          "&:hover": {
                            color: "rgba(255,255,255,1)",
                            backgroundColor: "rgba(255,255,255,0.2)",
                          },
                        }}
                      >
                        <ExpandMoreIcon sx={{ fontSize: 28 }} />
                      </IconButton>
                    )}
                  </Box>
                )}

                {!hasVisibleCustomButtons && hasOverflow && (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 0.75, flexShrink: 0 }}>
                    <IconButton
                      aria-label={isOverflowExpanded ? "Collapse content" : "Expand content"}
                      aria-expanded={isOverflowExpanded}
                      aria-controls={`card-overflow-content-${contentId}`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => setIsOverflowExpanded((prev) => !prev)}
                      sx={{
                        color: "rgba(255,255,255,0.8)",
                        p: 0.75,
                        backgroundColor: "rgba(255,255,255,0.12)",
                        border: "1px solid rgba(255,255,255,0.25)",
                        transition: "transform 0.3s ease, color 0.2s ease, background-color 0.2s ease",
                        transform: isOverflowExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        "&:hover": {
                          color: "rgba(255,255,255,1)",
                          backgroundColor: "rgba(255,255,255,0.2)",
                        },
                      }}
                    >
                      <ExpandMoreIcon sx={{ fontSize: 28 }} />
                    </IconButton>
                  </Box>
                )}
              </>
            );
          })()}
        </Box>

        {/* Info Modal */}
        <Modal open={isInfoModalOpen} onClose={toggleInfoModal} closeAfterTransition>
          <Fade in={isInfoModalOpen}>
              <Box
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 400,
                  bgcolor: "background.paper",
                  borderRadius: 2,
                  boxShadow: 24,
                  p: 3,
                }}
              >
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Additional Information
                </Typography>
                {customContentTheme?.note?.htmlContent ? (
                  <Box
                    sx={{
                      "& *": {
                        margin: 0,
                        padding: 0,
                      },
                      "& p": {
                        marginBottom: "0.5em",
                      },
                      whiteSpace: "pre-line",
                      wordWrap: "break-word",
                    }}
                  >
                    {safeParseHtml(customContentTheme.note.htmlContent)}
                  </Box>
                ) : (
                  <Typography
                    variant="body2"
                    sx={{ whiteSpace: "pre-line", ...customContentTheme?.note }}
                  >
                    {note}
                  </Typography>
                )}
              </Box>
            </Fade>
          </Modal>

          <Divider sx={{ borderColor: "rgba(255,255,255,0.03)", flexShrink: 0 }} />

          <CardActions
            disableSpacing
            sx={{
              pt: 0.5,
              pb: 0.75,
              px: 2.5,
              minHeight: 44,
              justifyContent: "flex-start",
              gap: 1.5,
              flexShrink: 0,
            }}
          >
            <Tooltip
              title={
                likes.length > 0 ? (
                    <Box sx={{ maxWidth: 250 }}>
                    <Box sx={{ maxHeight: 200, overflowY: "auto" }}>
                      {likes.slice(0, 20).map((liker, index) => (
                      <Typography key={index} variant="body2">
                        {liker.firstName && liker.lastName
                        ? `${liker.firstName} ${liker.lastName}`
                        : liker.email}
                      </Typography>
                      ))}
                      {likes.length > 20 && (
                      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                        +{likes.length - 20} more
                      </Typography>
                      )}
                    </Box>
                  </Box>
                ) : (
                  "No likes yet"
                )
              }
              arrow
              placement="top"
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }} onMouseEnter={fetchLikesIfNeeded}>
                <IconButton
                  aria-label="like"
                  onClick={toggleLike}
                  size="small"
                  sx={{
                    color: like ? "#ff6b9d" : "rgba(255,255,255,0.7)",
                    p: 0.5,
                    "&:hover": {
                      transform: "scale(1.1)",
                      color: "#ff6b9d",
                    },
                  }}
                >
                  {like ? (
                    <FavoriteIcon sx={{ fontSize: 18 }} />
                  ) : (
                    <FavoriteBorderIcon sx={{ fontSize: 18 }} />
                  )}
                </IconButton>
                <Typography
                  component="button"
                  onClick={() => {
                    if (localLikesCount > 0) {
                      fetchLikesIfNeeded();
                      setIsLikesModalOpen(true);
                    }
                  }}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (localLikesCount > 0 && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      fetchLikesIfNeeded();
                      setIsLikesModalOpen(true);
                    }
                  }}
                  tabIndex={localLikesCount > 0 ? 0 : -1}
                  role="button"
                  aria-label={`View ${localLikesCount} liker${localLikesCount !== 1 ? "s" : ""}`}
                  sx={{
                    fontSize: 11,
                    color: theme.palette.common.white,
                    cursor: localLikesCount > 0 ? "pointer" : "default",
                    paddingRight: 0.5,
                    fontWeight: 500,
                    border: "none",
                    background: "none",
                    padding: 0,
                    font: "inherit",
                    "&:focus-visible": {
                      outline: "2px solid rgba(255,255,255,0.5)",
                      borderRadius: "2px",
                      outlineOffset: "2px",
                    },
                    "&:hover": localLikesCount > 0 ? { textDecoration: "underline" } : {},
                  }}
                >
                  {localLikesCount}
                </Typography>
              </Box>
            </Tooltip>

            {!isExpanded && (
              <IconButton
                aria-label="comment"
                onClick={commentDrawerHandler}
                size="small"
                sx={{
                  color: "rgba(255,255,255,0.7)",
                  p: 0.5,
                  "&:hover": {
                    transform: "scale(1.1)",
                    color: "#fff",
                  },
                }}
              >
                <ChatBubbleOutlineIcon sx={{ fontSize: 18 }} />
                <Typography sx={{ ml: 0.5, fontSize: 11, color: "inherit" }}>
                  {commentCount}
                </Typography>
              </IconButton>
            )}

            {authorizedRoles.includes(Role.SALES_ADMIN) && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => setIsCustomButtonDialogOpen(true)}
                sx={{
                  minHeight: 26,
                  fontSize: "0.7rem",
                  borderStyle: "dashed",
                  color: "rgba(255,255,255,0.5)",
                  borderColor: "rgba(255,255,255,0.2)",
                  px: 1.5,
                  py: 0.25,
                  borderRadius: 1.5,
                  textTransform: "none",
                  ml: 2.5,
                  "&:hover": {
                    borderStyle: "solid",
                    borderColor: "rgba(255,255,255,0.4)",
                    color: "rgba(255,255,255,0.7)",
                    backgroundColor: "rgba(0, 0, 0, 0.05)",
                  },
                }}
              >
                + Customize Buttons
              </Button>
            )}
          </CardActions>

        {/* Dialogs / drawers */}
        <UpdateContentDialogBox
          type="update"
          isOpen={isUpdateDialogOpen}
          handleClose={() => setIsUpdateDialogOpen(false)}
          initialValues={{
            contentId,
            sectionId,
            contentLink,
            contentType,
            contentSubtype,
            description,
            thumbnail,
            note,
            customContentTheme,
            verifyContent: false,
            tags,
            isReused,
          }}
        />

        <DeleteDialogBox
          type={"content"}
          open={isDeleteDialogOpen}
          handleClose={() => setIsDeleteDialogOpen(false)}
          contentId={contentId}
          sectionId={sectionId}
        />

        <ExpandedContentCard
          expandCard={isCommentDrawerOpen}
          expandedCardClose={closeCommentDrawer}
          contentId={contentId}
          contentLink={getEmbedUrl(contentType as FILETYPE, contentLink, contentSubtype)}
          originalContentLink={contentLink}
          contentType={contentType}
          contentSubtype={contentSubtype}
          description={description}
          likesCount={localLikesCount}
          contentOrder={contentOrder}
          sectionId={sectionId}
          status={status}
          commentCount={commentCount}
          createdOn={createdOn}
          tags={tags}
          customButtons={customButtons}
          note={note}
          customContentTheme={customContentTheme}
        />

        <IframeViewerDialogBox
          link={getEmbedUrl(contentType as FILETYPE, contentLink, contentSubtype)}
          originalUrl={contentLink}
          open={isPreviewModalOpen}
          handleClose={() => setIsPreviewModalOpen(false)}
          contentId={contentId}
          description={description}
          contentType={contentType}
          contentSubtype={contentSubtype}
        />

        <CustomButtonConfigDialog
          open={isCustomButtonDialogOpen}
          onClose={() => setIsCustomButtonDialogOpen(false)}
          contentId={contentId}
          sectionId={sectionId}
          initialButtons={localCustomButtons}
          onSave={handleSaveCustomButtons}
        />

        <LikesModal
          open={isLikesModalOpen}
          onClose={() => setIsLikesModalOpen(false)}
          likes={likes}
        />

         {isOverflowExpanded && (
           <Box
             sx={{
               position: "absolute",
               top: 0,
               left: 0,
               right: 0,
               bottom: 0,
               zIndex: 19,
               borderRadius: "inherit",
             }}
             onClick={() => setIsOverflowExpanded(false)}
           />
         )}
         <Box
           id={`card-overflow-content-${contentId}`}
           sx={{
             position: "absolute",
             top: `${PREVIEW_H - 30}px`,
             left: 0,
             right: 0,
             bottom: 0,
             zIndex: 20,
             borderRadius: "0 0 40px 40px",
             overflow: "hidden",
             display: "flex",
             flexDirection: "column",
             backgroundColor: "rgba(20,21,27,0.97)",
             backdropFilter: "blur(20px)",
             border: "1px solid rgba(255,255,255,0.1)",
             borderTop: "none",
             opacity: isOverflowExpanded ? 1 : 0,
             pointerEvents: isOverflowExpanded ? "auto" : "none",
             transition: "opacity 0.25s ease",
           }}
           onClick={(e) => e.stopPropagation()}
         >
               <Box
                sx={{
                  flexGrow: 1,
                  overflowY: "auto",
                  p: 2,
                  pt: 1.5,
                  "&::-webkit-scrollbar": { width: 4 },
                  "&::-webkit-scrollbar-track": { background: "rgba(255,255,255,0.05)", borderRadius: 2 },
                  "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.2)", borderRadius: 2 },
                }}
              >
               {/* Close chevron at top */}
                <Box sx={{ display: "flex", justifyContent: "center", mb: 0.5 }}>
                  <IconButton
                    size="small"
                    aria-label="Collapse content"
                    aria-expanded={true}
                    aria-controls={`card-overflow-content-${contentId}`}
                    onClick={() => setIsOverflowExpanded(false)}
                    sx={{
                      color: "rgba(255,255,255,0.45)",
                      p: 0.25,
                      transition: "transform 0.3s ease",
                      transform: "rotate(180deg)",
                      "&:hover": { color: "rgba(255,255,255,0.9)" },
                    }}
                  >
                    <ExpandMoreIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Box>

                {(() => {
                  const contentOrder = getCardContentOrder();
                  return contentOrder.map((sectionName) => renderOverlaySection(sectionName));
                })()}

              </Box>
         </Box>
      </Card>
    </Grow>
  );
};

export default ComponentCard;
