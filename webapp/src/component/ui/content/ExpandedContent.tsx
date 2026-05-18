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

import IframeViewerDialogBox from "@components/dialogs/IframeViewerDialogBox";
import UpdateContentDialogBox from "@components/dialogs/ContentDialogBox";
import DeleteContentDialogBox from "@components/dialogs/DeleteDialogBox";
import ComponentCard from "@components/ui/content/Card";
import CommentCard from "@components/ui/CommentCard";
import CommentInput from "@components/ui/CommentInput";
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  Box,
  Stack,
  Divider,
  Typography,
  alpha,
} from "@mui/material";
import { CustomButton, CustomTheme, CommentsResponse } from "@/types/types";
import { RootState, useAppSelector } from "@slices/store";


interface ComponentCardProps {
  expandCard: boolean;
  expandedCardClose: () => void;
  contentId: number;
  contentLink: string;
  originalContentLink: string;
  contentType: string;
  contentSubtype?: string;
  description: string;
  likesCount: number;
  sectionId: number;
  thumbnail?: string;
  note?: string;
  status?: boolean;
  contentOrder: number;
  commentCount: number;
  createdOn: string;
  tags: string[];
  customButtons?: CustomButton[];
  customContentTheme?: CustomTheme;
}

const ExpandedContentCard: React.FC<ComponentCardProps> = ({
  expandCard,
  expandedCardClose,
  contentId,
  contentLink,
  originalContentLink,
  contentType,
  contentSubtype,
  description,
  likesCount,
  sectionId,
  thumbnail,
  note,
  contentOrder,
  status,
  commentCount,
  createdOn,
  tags,
  customButtons,
  customContentTheme,
}) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isFullScreenDrawerOpen, setIsFullScreenDrawerOpen] = useState(false);

  const comments = useAppSelector((s: RootState) => s.page.comments as CommentsResponse[]) ?? [];

  return (
    <Dialog
      open={expandCard}
      onClose={expandedCardClose}
      fullWidth
      maxWidth="md"
      disableScrollLock
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: "blur(12px)",
            backgroundColor: "rgba(0, 0, 0, 0.6)",
          },
        },
      }}
      PaperProps={{
        sx: (t) => ({
          borderRadius: 4,
          overflow: "hidden",
          background: `linear-gradient(145deg, ${alpha(
            t.palette.background.paper,
            0.85,
          )} 0%, ${alpha(t.palette.background.default, 0.9)} 100%)`,
          backdropFilter: "blur(20px)",
          border: `1px solid ${alpha(t.palette.common.white, 0.1)}`,
          boxShadow: `0 8px 32px ${alpha(t.palette.common.black, 0.4)}`,
        }),
      }}
    >
      <DialogContent sx={{ p: { xs: 2, md: 3 }, width: "100%" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={10}
          alignItems="flex-start"
          sx={{ mt: 4 }}
        >
          {/* Left: Content Card */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <ComponentCard
              contentId={contentId}
              contentLink={contentLink}
              contentType={contentType}
              description={description}
              likesCount={likesCount}
              sectionId={sectionId}
              isExpanded
              status={status}
              contentOrder={contentOrder}
              thumbnail={thumbnail}
              note={note}
              commentCount={commentCount}
              createdOn={createdOn}
              tags={tags}
              customButtons={customButtons}
              customContentTheme={customContentTheme}
              isInPinnedSection={sectionId === -2}
            />
          </Box>

          {/* Right: Comments Panel without Box */}
          <Box
            sx={{
              flex: 1,
              width: "100%",
              height: 450,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Typography
              fontWeight={600}
              sx={{ mb: 2, fontSize: "1.1rem", flexShrink: 0 }}
            >
              Comments ({comments.length})
            </Typography>

            <Divider
              sx={{
                mb: 2,
                opacity: 0.2,
                background: (t) => alpha(t.palette.common.white, 0.1),
                flexShrink: 0,
              }}
            />

            {/* Comments List - Scrollable */}
            <Box
              sx={{
                flex: 1,
                overflowY: "auto",
                mb: 2,
                pr: 1,
                minHeight: 0,
                scrollbarWidth: "thin",
                scrollbarColor: (t) =>
                  `${alpha(t.palette.primary.main, 0.3)} transparent`,
                "&::-webkit-scrollbar": {
                  width: 6,
                },
                "&::-webkit-scrollbar-track": {
                  background: "transparent",
                  borderRadius: 999,
                },
                "&::-webkit-scrollbar-thumb": {
                  borderRadius: 999,
                  background: (t) => alpha(t.palette.primary.main, 0.3),
                  "&:hover": {
                    background: (t) => alpha(t.palette.primary.main, 0.5),
                  },
                },
              }}
            >
              {comments.length === 0 ? (
                <Box
                  sx={{
                    textAlign: "center",
                    py: 4,
                    opacity: 0.6,
                  }}
                >
                  <Typography variant="body2">
                    No comments yet. Be the first to share feedback.
                  </Typography>
                </Box>
              ) : (
                <>
                  {comments.map((c: CommentsResponse) => (
                    <Box key={c.commentId} sx={{ mb: 1.5 }}>
                      <CommentCard
                        commentResponse={c}
                        contentId={contentId}
                        description={description}
                      />
                    </Box>
                  ))}
                </>
              )}
            </Box>

            {/* Add Comment Section - Fixed at Bottom */}
            <Box
              sx={(t) => ({
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                p: 2,
                borderRadius: 3,
                background: alpha(t.palette.background.paper, 0.5),
                border: `1px solid ${alpha(t.palette.common.white, 0.05)}`,
                flexShrink: 0,
              })}
            >
              <CommentInput contentId={contentId} />
            </Box>
          </Box>
        </Stack>
      </DialogContent>

      <UpdateContentDialogBox
        type="update"
        isOpen={isUpdateDialogOpen}
        handleClose={() => setIsUpdateDialogOpen(false)}
        initialValues={{
          contentId,
          sectionId,
          contentLink,
          contentType,
          description,
          verifyContent: false,
          tags,
        }}
      />

      <DeleteContentDialogBox
        type="content"
        open={isDeleteDialogOpen}
        handleClose={() => setIsDeleteDialogOpen(false)}
        contentId={contentId}
        sectionId={sectionId}
      />

      <IframeViewerDialogBox
        link={contentLink}
        originalUrl={originalContentLink}
        open={isFullScreenDrawerOpen}
        handleClose={() => setIsFullScreenDrawerOpen(false)}
        contentId={contentId}
        description={description}
        contentType={contentType}
        contentSubtype={contentSubtype}
      />
    </Dialog>
  );
};

export default ExpandedContentCard;
