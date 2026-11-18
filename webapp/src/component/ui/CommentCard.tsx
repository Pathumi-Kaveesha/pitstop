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

import React, { useState } from "react";
import {
  Avatar,
  Box,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  Button,
  useTheme,
  Stack,
  CircularProgress,
} from "@mui/material";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DescriptionIcon from "@mui/icons-material/Description";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useAppDispatch, useAppSelector, RootState } from "@slices/store";
import { updateComment, deleteComment } from "@slices/pageSlice/page";
import { enqueueSnackbarMessage } from "@slices/commonSlice/common";
import { CommentsResponse } from "@/types/types";
import { Role } from "@utils/types";

export interface CommentCardProps {
  commentResponse: CommentsResponse;
  contentId: number;
}

const CommentCard: React.FC<CommentCardProps> = ({
  commentResponse,
  contentId,
}) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const currentUserEmail = useAppSelector(
    (state: RootState) => state.auth.userInfo?.email ?? "",
  );
  const isOwner = commentResponse.userEmail === currentUserEmail;
  const authorizedRoles: Role[] = useAppSelector((state: RootState) => state.auth.roles);
  const isAdmin = authorizedRoles.includes(Role.SALES_ADMIN);

  const canManageComment = isOwner || isAdmin;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const openMenu = Boolean(anchorEl);
  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>) =>
    setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const [editing, setEditing] = useState(false);
  const [newComment, setNewComment] = useState(commentResponse.comment);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const startEdit = () => {
    setNewComment(commentResponse.comment);
    setEditing(true);
    handleMenuClose();
  };
  const cancelEdit = () => setEditing(false);
  const confirmEdit = async () => {
    setIsUpdating(true);
    try {
      await dispatch(
        updateComment({
          commentId: commentResponse.commentId,
          contentId,
          comment: newComment,
        }),
      ).unwrap();

      setEditing(false);
      
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      dispatch(
        enqueueSnackbarMessage({
          message: "Failed to update comment. Please try again.",
          type: "error",
          anchorOrigin: {
            vertical: "bottom",
            horizontal: "right",
          },
        }),
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const [deleting, setDeleting] = useState(false);
  const startDelete = () => {
    setDeleting(true);
    handleMenuClose();
  };
  const cancelDelete = () => setDeleting(false);
  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await dispatch(
        deleteComment({
          commentId: commentResponse.commentId,
          contentId,
          comment: commentResponse.comment,
        }),
      ).unwrap();

      setDeleting(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      dispatch(
        enqueueSnackbarMessage({
          message: "Failed to delete comment. Please try again.",
          type: "error",
          anchorOrigin: {
            vertical: "bottom",
            horizontal: "right",
          },
        }),
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", mb: 3 }}>
      <Avatar
        src={commentResponse.userThumbnail}
        sx={{ width: 30, height: 30, boxShadow: 1, mt: 1 }}
      />
      <Box sx={{ ml: 2, flex: 1, position: "relative", maxWidth: "100%" }}>
        <Typography
          variant="body1"
          color={theme.palette.secondary.contrastText}
          sx={{ fontWeight: "bold" }}
        >
          {commentResponse.userName}
        </Typography>
        <Typography
          variant="body2"
          color="text.primary"
          sx={{
            mt: 0.5,
            wordWrap: "break-word",
            overflowWrap: "break-word",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
            wordBreak: "break-word",
            maxWidth: "90%",
          }}
        >
          {renderCommentText(commentResponse.comment)}
        </Typography>

        {canManageComment && (
          <IconButton
            size="small"
            onClick={handleMenuOpen}
            sx={{ position: "absolute", top: 8, right: 8 }}
          >
            <MoreVertOutlinedIcon fontSize="small" />
          </IconButton>
        )}

        <Menu
          anchorEl={anchorEl}
          open={openMenu}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          PaperProps={{ elevation: 3 }}
        >
          <MenuItem onClick={startEdit}>
            <EditIcon sx={{ mr: 1, fontSize: 20 }} />
            Edit
          </MenuItem>
          <MenuItem onClick={startDelete} sx={{ color: "error.main" }}>
            <DeleteIcon sx={{ mr: 1, fontSize: 20 }} />
            Delete
          </MenuItem>
        </Menu>

        {/* Edit Comment Dialog */}
        <Dialog
          open={editing}
          onClose={cancelEdit}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: {
              overflow: "visible",
            },
          }}
        >
          <DialogTitle
            sx={{
              background: "linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)",
              color: "white",
              py: 2.5,
              pb: 3,
              position: "relative",
            }}
          >
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}
            >
              <EditIcon sx={{ fontSize: 32 }} />
              <Typography variant="h4" fontWeight="bold">
                Edit Comment
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ opacity: 0.95, ml: 5 }}>
              Update your comment
            </Typography>
            <IconButton
              aria-label="close"
              onClick={cancelEdit}
              sx={{
                position: "absolute",
                right: 16,
                top: 16,
                color: "white",
              }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ pt: 4, pb: 2 }}>
            <Stack spacing={3}>
              <Box>
                <Box
                  sx={{ display: "flex", alignItems: "center", mb: 1.5, mt: 2 }}
                >
                  <DescriptionIcon
                    sx={{ color: "#ff6b35", mr: 1, fontSize: 22, mt: 2 }}
                  />
                  <Typography variant="h6" fontWeight="700">
                    Comment
                  </Typography>
                </Box>
                <TextField
                  autoFocus
                  fullWidth
                  multiline
                  rows={4}
                  placeholder="Enter your comment"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
              </Box>
            </Stack>
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <Button
              variant="outlined"
              onClick={cancelEdit}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                px: 3,
                color: theme.palette.grey[700],
                borderColor: theme.palette.grey[300],
                "&:hover": {
                  borderColor: theme.palette.grey[400],
                  backgroundColor: theme.palette.grey[50],
                },
              }}
            >
              Cancel
            </Button>

            <Button
              variant="contained"
              onClick={confirmEdit}
              disabled={!newComment.trim() || isUpdating}
              startIcon={isUpdating ? <CircularProgress size={16} /> : null}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                px: 3,
                backgroundColor: "#ff7300",
                color: "#ffffff",
              }}
            >
              {isUpdating ? "Saving..." : "Save Comment"}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Comment Dialog */}
        <Dialog
          open={deleting}
          onClose={cancelDelete}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: {
              overflow: "visible",
            },
          }}
        >
          <DialogTitle
            sx={{
              background: "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)",
              color: "white",
              py: 2.5,
              pb: 3,
              position: "relative",
            }}
          >
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}
            >
              <WarningAmberIcon sx={{ fontSize: 32 }} />
              <Typography variant="h4" fontWeight="bold">
                Delete Comment
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ opacity: 0.95, ml: 5 }}>
              This action cannot be undone
            </Typography>
            <IconButton
              aria-label="close"
              onClick={cancelDelete}
              sx={{
                position: "absolute",
                right: 16,
                top: 16,
                color: "white",
              }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ pt: 4, pb: 3, px: 3 }}>
            <Box
              sx={{
                p: 3,
                backgroundColor:
                  theme.palette.mode === "dark"
                    ? theme.palette.grey[800]
                    : theme.palette.grey[50],
                borderRadius: 2,
              }}
            >
              <Typography variant="body1" sx={{ lineHeight: 1.6, mt: 2 }}>
                Are you sure you want to delete this comment? This action cannot
                be undone and the comment will be permanently removed.
              </Typography>
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <Button
              variant="outlined"
              onClick={cancelDelete}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                px: 3,
                color: theme.palette.grey[700],
                borderColor: theme.palette.grey[300],
                "&:hover": {
                  borderColor: theme.palette.grey[400],
                  backgroundColor: theme.palette.grey[50],
                },
              }}
            >
              Cancel
            </Button>

            <Button
              variant="contained"
              onClick={confirmDelete}
              disabled={isDeleting}
              startIcon={isDeleting ? <CircularProgress size={16} /> : null}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                px: 3,
                backgroundColor: "#be0f0fec",
                color: "#ffffff",
              }}
            >
              {isDeleting ? "Deleting..." : "Delete Comment"}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

// Render comment text with highlighted @mentions
function renderCommentText(text: string): React.ReactNode {
  const mentionPattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
  const parts = text.split(mentionPattern);
  const mentions = text.match(mentionPattern) || [];

  const nodes: React.ReactNode[] = [];

  parts.forEach((part, index) => {
    if (part) {
      nodes.push(part);
    }
    if (mentions[index]) {
      nodes.push(
        <span
          key={`mention-${index}`}
          style={{
            color: "#2563eb",
            fontWeight: 600,
          }}
        >
          {mentions[index]}
        </span>
      );
    }
  });

  return nodes.length > 0 ? nodes : text;
}

export default CommentCard;
