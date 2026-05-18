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

import CloseIcon from "@mui/icons-material/Close";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Box, IconButton, Typography, useTheme } from "@mui/material";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";

import { publishQuiz } from "@slices/quizSlice/quiz";
import { useAppDispatch } from "@slices/store";

interface PublishDialogBoxProps {
  open: boolean;
  handleClose: () => void;
  quizId?: number;
  quizTitle?: string;
  onPublishAndAssign?: () => void;
}

const PublishDialogBox = ({ open, handleClose, quizId, quizTitle, onPublishAndAssign }: PublishDialogBoxProps) => {
  const dispatch = useAppDispatch();
  const theme = useTheme();

  const dialogBoxHandler = async () => {
    if (quizId == null) return;
    await dispatch(publishQuiz(quizId)).unwrap();
    handleClose();
  };
  
  const publishAndAssignHandler = async () => {
    if (quizId == null) return;
    await dispatch(publishQuiz(quizId)).unwrap();
    handleClose();
    onPublishAndAssign?.();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          overflow: "visible",
        },
      }}
    >
      <DialogTitle
        sx={{
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
          color: theme.palette.common.white,
          py: 2.5,
          pb: 3,
          position: "relative",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
          <WarningAmberIcon sx={{ fontSize: 32 }} />
          <Typography variant="h4" fontWeight="bold">
            Publish Quiz
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ opacity: 0.95, ml: 5 }}>
          This action cannot be undone
        </Typography>
        <IconButton
          aria-label="close"
          onClick={handleClose}
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
              theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[50],
          }}
        >
          <Typography variant="body1" sx={{ lineHeight: 1.6 }} mt={2}>
            {quizTitle
              ? `Are you sure you want to publish "${quizTitle}"? Once published, it can no longer be edited.`
              : "Are you sure you want to publish this quiz? Once published, it can no longer be edited."}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button
          variant="outlined"
          onClick={handleClose}
          sx={{
            borderRadius: 4,
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
          onClick={dialogBoxHandler}
          sx={{
            borderRadius: 4,
            textTransform: "none",
            px: 3,
            backgroundColor: theme.palette.primary.main,
            "&:hover": {
              backgroundColor: theme.palette.primary.dark,
            },
            color: theme.palette.common.white,
          }}
        >
          Publish
        </Button>
        <Button
          variant="contained"
          onClick={publishAndAssignHandler}
          sx={{
            borderRadius: 4,
            textTransform: "none",
            px: 3,
            backgroundColor: theme.palette.primary.main,
            "&:hover": {
              backgroundColor: theme.palette.primary.dark,
            },
            color: theme.palette.common.white,
          }}
        >
          Publish & Assign
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PublishDialogBox;
