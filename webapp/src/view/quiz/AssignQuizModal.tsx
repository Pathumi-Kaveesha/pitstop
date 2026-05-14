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
import GroupIcon from "@mui/icons-material/Group";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";
import PersonOffIcon from "@mui/icons-material/PersonOff";
import SearchIcon from "@mui/icons-material/Search";
import SendIcon from "@mui/icons-material/Send";
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { EmployeeSuggestion, QuizAssignableEmployee } from "@/types/types";
import { QuizAdmin } from "@/types/types";
import {
  assignUsersToQuiz,
  fetchAdminQuizzes,
  fetchAssignedQuizUsers,
  fetchQuizEmployeeSuggestions,
  fetchQuizUserByEmail,
  resetAssign,
} from "@slices/quizSlice/quiz";
import { RootState, useAppDispatch, useAppSelector } from "@slices/store";

interface Props {
  open: boolean;
  quiz: QuizAdmin | null;
  onClose: () => void;
}

const AssignQuizModal: React.FC<Props> = ({ open, quiz, onClose }) => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const assignStatus = useAppSelector((state: RootState) => state.quiz.assignStatus);
  const isDarkMode = theme.palette.mode === "dark";

  const dialogBackground = isDarkMode ? theme.palette.grey[900] : theme.palette.background.paper;
  const subtleSurface = isDarkMode
    ? alpha(theme.palette.common.white, 0.03)
    : theme.palette.grey[50];
  const subtleBorder = isDarkMode ? alpha(theme.palette.common.white, 0.08) : theme.palette.divider;
  const borderColor = isDarkMode ? alpha(theme.palette.common.white, 0.1) : theme.palette.divider;
  const hoverSurface = alpha(theme.palette.primary.main, isDarkMode ? 0.12 : 0.08);
  const inputSurface = isDarkMode
    ? alpha(theme.palette.common.white, 0.04)
    : theme.palette.grey[50];

  const [currentlyAssignedUsers, setCurrentlyAssignedUsers] = useState<QuizAssignableEmployee[]>(
    [],
  );
  const [pendingUsers, setPendingUsers] = useState<QuizAssignableEmployee[]>([]);
  const [timeLimit, setTimeLimit] = useState<number | "">("");
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<EmployeeSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isRemoving, setIsRemoving] = useState<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const refreshAssignedUsers = useCallback(() => {
    if (quiz && quiz.assignedUserIds.length > 0) {
      setLoadingAssigned(true);
      dispatch(fetchAssignedQuizUsers(quiz.assignedUserIds))
        .unwrap()
        .then((users) => {
          setCurrentlyAssignedUsers(users);
        })
        .catch((error) => {
          console.error("Failed to fetch assigned users:", error);
        })
        .finally(() => {
          setLoadingAssigned(false);
        });
    } else {
      setCurrentlyAssignedUsers([]);
    }
  }, [dispatch, quiz]);

  useEffect(() => {
    if (open) {
      refreshAssignedUsers();
      setPendingUsers([]);
      setTimeLimit("");
    }
  }, [open, refreshAssignedUsers]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSuggestions([]);
      setIsLoadingSuggestions(false);
    }
  }, [open]);

  const handleSearchChange = useCallback(
    (newText: string) => {
      setSearchQuery(newText);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (!newText.trim()) {
        setSuggestions([]);
        setIsLoadingSuggestions(false);
        return;
      }

      if (newText.length < 2) {
        setSuggestions([]);
        setIsLoadingSuggestions(false);
        return;
      }

      debounceTimerRef.current = setTimeout(() => {
        setIsLoadingSuggestions(true);
        const excludedEmails = [
          ...currentlyAssignedUsers.map((u) => u.workEmail),
          ...pendingUsers.map((u) => u.workEmail),
        ];

        dispatch(
          fetchQuizEmployeeSuggestions({
            searchQuery: newText,
            excludedEmails,
          }),
        )
          .unwrap()
          .then((result) => {
            setSuggestions(result);
          })
          .catch(() => {
            setSuggestions([]);
          })
          .finally(() => {
            setIsLoadingSuggestions(false);
          });
      }, 300);
    },
    [dispatch, currentlyAssignedUsers, pendingUsers],
  );

  const handleEmployeeSelect = (employee: EmployeeSuggestion) => {
    dispatch(fetchQuizUserByEmail(employee.workEmail))
      .unwrap()
      .then((fullEmployee) => {
        if (!fullEmployee) {
          return;
        }

        setPendingUsers((prev) => [...prev, fullEmployee]);
        setSearchQuery("");
        setSuggestions([]);
      })
      .catch((error) => {
        console.error("Failed to fetch user details:", error);
      });
  };

  const handleRemoveUser = async (userId: number, isPending: boolean) => {
    if (isPending) {
      setPendingUsers((prev) => prev.filter((emp) => emp.userId !== userId));
      return;
    }

    if (!quiz) return;

    setIsRemoving(userId);
    try {
      const remainingUserIds = currentlyAssignedUsers
        .filter((u) => u.userId !== userId)
        .map((u) => u.userId);

      await dispatch(
        assignUsersToQuiz({ quizId: quiz.quizId, userIds: remainingUserIds }),
      ).unwrap();

      setCurrentlyAssignedUsers((prev) => prev.filter((u) => u.userId !== userId));
      dispatch(fetchAdminQuizzes());
    } catch (error) {
      console.error("Failed to remove user:", error);
    } finally {
      setIsRemoving(null);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSearchChange(e.target.value);
  };

  const handleAssign = async () => {
    if (!quiz || timeLimit === "" || Number.isNaN(Number(timeLimit))) return;
    try {
      const allUserIds = [
        ...currentlyAssignedUsers.map((u) => u.userId),
        ...pendingUsers.map((u) => u.userId),
      ];
      await dispatch(
        assignUsersToQuiz({
          quizId: quiz.quizId,
          userIds: allUserIds,
          timeLimitMinutes: Number(timeLimit),
        }),
      ).unwrap();
      await dispatch(fetchAdminQuizzes());
      onClose();
    } catch (error) {
      console.error("Failed to assign users:", error);
    }
  };

  const handleClose = () => {
    dispatch(resetAssign());
    setPendingUsers([]);
    setCurrentlyAssignedUsers([]);
    setSearchQuery("");
    setSuggestions([]);
    onClose();
  };

  const isLoading = assignStatus === "loading" || loadingAssigned;
  const isAssignDisabled =
    isLoading || pendingUsers.length === 0 || timeLimit === "" || Number.isNaN(Number(timeLimit));

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: "16px",
          backgroundColor: dialogBackground,
          color: theme.palette.text.primary,
          boxShadow: isDarkMode ? "0 24px 80px rgba(0,0,0,0.45)" : "0 20px 60px rgba(0,0,0,0.15)",
          overflow: "visible",
          maxWidth: 580,
        },
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 3,
          pt: 3,
          pb: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "8px",
              backgroundColor: alpha(theme.palette.primary.main, isDarkMode ? 0.18 : 0.1),
              border: `1.5px solid ${alpha(theme.palette.primary.main, isDarkMode ? 0.4 : 0.25)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PersonAddAlt1Icon sx={{ fontSize: 17, color: theme.palette.primary.main }} />
          </Box>
          <Typography variant="h6" fontWeight={700} fontSize={18} color="text.primary">
            Assign quiz
          </Typography>
        </Box>
        <IconButton
          onClick={handleClose}
          size="small"
          disabled={isLoading}
          sx={{
            color: "text.secondary",
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pt: 0.5, pb: 2, overflowY: "auto", maxHeight: "70vh" }}>
        {/* Description */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
          Assign{" "}
          <Typography component="span" variant="body2" fontWeight={700} color="text.primary">
            {quiz?.title}
          </Typography>{" "}
          to people from your HR directory. They'll get an email notification.
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2.5 }}>
          <TextField
            label="Time limit (minutes)"
            type="number"
            size="small"
            value={timeLimit}
            onChange={(e) => {
              const value = e.target.value;
              setTimeLimit(value === "" ? "" : Math.max(1, Number(value)));
            }}
            inputProps={{ min: 1, max: 1440 }}
            required
            sx={{ width: 160 }}
          />
        </Box>

        {/* Divider line */}
        <Box sx={{ height: "1px", backgroundColor: borderColor, mb: 2.5, mx: -3 }} />

        {/* Search Section */}
        <Box sx={{ mb: 3, position: "relative" }}>
          <Typography
            variant="caption"
            fontWeight={500}
            color="text.secondary"
            sx={{ mb: 1, display: "block", fontSize: "0.8rem" }}
          >
            Search by name, email or role
          </Typography>
          <TextField
            inputRef={searchInputRef}
            placeholder="Type a name..."
            value={searchQuery}
            onChange={handleTextChange}
            fullWidth
            size="small"
            disabled={isLoading}
            InputProps={{
              startAdornment: (
                <SearchIcon sx={{ color: theme.palette.text.secondary, fontSize: 18, mr: 0.75 }} />
              ),
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: "10px",
                backgroundColor: inputSurface,
                fontSize: "0.9rem",
                "& fieldset": {
                  borderColor: subtleBorder,
                },
                "&:hover fieldset": {
                  borderColor: theme.palette.text.disabled,
                },
                "&.Mui-focused fieldset": {
                  borderColor: theme.palette.primary.main,
                  borderWidth: "1.5px",
                },
              },
              "& .MuiInputBase-input": {
                py: "9px",
              },
            }}
          />

          {/* Suggestion dropdown */}
          {(suggestions.length > 0 || isLoadingSuggestions) && (
            <List
              sx={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                right: 0,
                maxHeight: 220,
                overflowY: "auto",
                backgroundColor: dialogBackground,
                border: `1px solid ${subtleBorder}`,
                borderRadius: "12px",
                zIndex: 20,
                boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                p: 0.5,
                scrollbarWidth: "thin",
              }}
            >
              {isLoadingSuggestions ? (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 2,
                    justifyContent: "center",
                    minHeight: "80px",
                  }}
                >
                  <CircularProgress
                    size={18}
                    thickness={4}
                    sx={{ color: theme.palette.primary.main }}
                  />
                  <Typography variant="body2" color="text.secondary" fontSize="0.85rem">
                    Finding people...
                  </Typography>
                </Box>
              ) : (
                <>
                  <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5 }}>
                    <Typography
                      sx={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: theme.palette.grey[300],
                      }}
                    >
                      People
                    </Typography>
                  </Box>
                  {suggestions.map((suggestion: EmployeeSuggestion, index: number) => (
                    <ListItem
                      key={suggestion.workEmail}
                      component="button"
                      onClick={() => handleEmployeeSelect(suggestion)}
                      sx={{
                        borderRadius: "8px",
                        cursor: "pointer",
                        border: "1px solid transparent",
                        transition: "all 0.12s ease",
                        py: 0.75,
                        px: 1,
                        mb: index < suggestions.length - 1 ? 0.25 : 0,
                        background: "transparent",
                        width: "100%",
                        textAlign: "left",
                        "&:hover": {
                          backgroundColor: hoverSurface,
                          border: `1px solid ${alpha(theme.palette.primary.main, isDarkMode ? 0.35 : 0.2)}`,
                        },
                      }}
                    >
                      <ListItemAvatar sx={{ minWidth: 40 }}>
                        <Avatar src={suggestion.employeeThumbnail} sx={{ width: 30, height: 30 }} />
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Typography
                            sx={{ fontWeight: 600, fontSize: "0.85rem", lineHeight: 1.2 }}
                          >
                            {suggestion.firstName} {suggestion.lastName}
                          </Typography>
                        }
                        secondary={
                          <Typography
                            sx={{
                              fontSize: "0.72rem",
                              color: theme.palette.grey[300],
                              lineHeight: 1.3,
                              mt: 0.1,
                            }}
                          >
                            {suggestion.workEmail}
                          </Typography>
                        }
                        sx={{ my: 0 }}
                      />
                    </ListItem>
                  ))}
                </>
              )}
            </List>
          )}
        </Box>

        {/* Pending Assignments Section */}
        {pendingUsers.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.75 }}>
              <SendIcon sx={{ fontSize: 18, color: theme.palette.primary.main }} />
              <Typography
                variant="subtitle2"
                fontWeight={700}
                fontSize="0.9rem"
                color="text.primary"
              >
                New assignments
              </Typography>
              <Chip
                label={pendingUsers.length}
                size="small"
                sx={{
                  height: 20,
                  minWidth: 26,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  backgroundColor: alpha(theme.palette.primary.main, isDarkMode ? 0.16 : 0.1),
                  color: theme.palette.primary.main,
                  border: `1px solid ${alpha(theme.palette.primary.main, isDarkMode ? 0.35 : 0.2)}`,
                  "& .MuiChip-label": { px: "6px" },
                }}
              />
            </Box>
            <Box
              sx={{
                borderRadius: "10px",
                border: `1.5px solid ${alpha(theme.palette.primary.main, isDarkMode ? 0.35 : 0.2)}`,
                overflow: "hidden",
                backgroundColor: subtleSurface,
              }}
            >
              <Table size="small">
                <TableBody>
                  {pendingUsers.map((emp) => (
                    <TableRow key={emp.userId} sx={{ "&:last-child td": { borderBottom: 0 } }}>
                      <TableCell sx={{ py: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Avatar src={emp.employeeThumbnail} sx={{ width: 26, height: 26 }} />
                          <Typography variant="body2" fontWeight={500} fontSize="0.85rem">
                            {emp.firstName} {emp.lastName}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" color="text.secondary" fontSize="0.82rem">
                          {emp.workEmail}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 1 }}>
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveUser(emp.userId, true)}
                          sx={{
                            color: theme.palette.error.main,
                            "&:hover": {
                              backgroundColor: alpha(
                                theme.palette.error.main,
                                isDarkMode ? 0.16 : 0.08,
                              ),
                            },
                          }}
                        >
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Box>
        )}

        {/* Divider */}
        {pendingUsers.length > 0 && (
          <Box sx={{ height: "1px", backgroundColor: borderColor, mb: 2.5, mx: -3 }} />
        )}

        {/* Currently Assigned Section */}
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.75 }}>
            <GroupIcon sx={{ fontSize: 18, color: theme.palette.text.secondary }} />
            <Typography variant="subtitle2" fontWeight={700} fontSize="0.9rem" color="text.primary">
              Currently assigned
            </Typography>
            <Chip
              label={currentlyAssignedUsers.length}
              size="small"
              sx={{
                height: 20,
                minWidth: 26,
                fontSize: "0.72rem",
                fontWeight: 700,
                backgroundColor: isDarkMode
                  ? alpha(theme.palette.common.white, 0.06)
                  : theme.palette.grey[100],
                color: theme.palette.text.secondary,
                border: `1px solid ${subtleBorder}`,
                "& .MuiChip-label": { px: "6px" },
              }}
            />
          </Box>

          {loadingAssigned ? (
            <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
              <CircularProgress size={22} sx={{ color: theme.palette.primary.main }} />
            </Box>
          ) : currentlyAssignedUsers.length === 0 ? (
            <Box
              sx={{
                py: 3,
                borderRadius: "10px",
                border: `1.5px dashed ${subtleBorder}`,
                textAlign: "center",
                backgroundColor: subtleSurface,
              }}
            >
              <Typography variant="body2" color="text.disabled" fontSize="0.85rem">
                Nobody is assigned to this quiz yet.
              </Typography>
            </Box>
          ) : (
            <Box
              sx={{ borderRadius: "10px", border: `1px solid ${borderColor}`, overflow: "hidden" }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: subtleSurface }}>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        py: 1,
                        fontSize: "0.8rem",
                        color: theme.palette.text.secondary,
                      }}
                    >
                      Name
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        py: 1,
                        fontSize: "0.8rem",
                        color: theme.palette.text.secondary,
                      }}
                    >
                      Email
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 600,
                        py: 1,
                        fontSize: "0.8rem",
                        color: theme.palette.text.secondary,
                        width: 60,
                      }}
                    >
                      Remove
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {currentlyAssignedUsers.map((emp) => (
                    <TableRow
                      key={emp.userId}
                      sx={{
                        "&:last-child td": { borderBottom: 0 },
                        "&:hover": { backgroundColor: hoverSurface },
                      }}
                    >
                      <TableCell sx={{ py: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Avatar src={emp.employeeThumbnail} sx={{ width: 26, height: 26 }} />
                          <Typography variant="body2" fontWeight={500} fontSize="0.85rem">
                            {emp.firstName} {emp.lastName}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" color="text.secondary" fontSize="0.82rem">
                          {emp.workEmail}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 1 }}>
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveUser(emp.userId, false)}
                          disabled={isRemoving === emp.userId || isLoading}
                          sx={{
                            color: theme.palette.error.main,
                            "&:hover": {
                              backgroundColor: alpha(
                                theme.palette.error.main,
                                isDarkMode ? 0.16 : 0.08,
                              ),
                            },
                          }}
                        >
                          {isRemoving === emp.userId ? (
                            <CircularProgress size={14} color="inherit" />
                          ) : (
                            <PersonOffIcon sx={{ fontSize: 16 }} />
                          )}
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Box>
      </DialogContent>

      {/* Footer */}
      <DialogActions
        sx={{
          px: 3,
          py: 2.5,
          gap: 1,
          borderTop: `1px solid ${borderColor}`,
        }}
      >
        <Button
          onClick={handleClose}
          disabled={isLoading}
          sx={{
            textTransform: "none",
            borderRadius: "10px",
            color: theme.palette.text.primary,
            fontWeight: 500,
            px: 2.5,
            "&:hover": { backgroundColor: subtleSurface },
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleAssign}
          disabled={isAssignDisabled}
          startIcon={
            assignStatus === "loading" ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <SendIcon sx={{ fontSize: "16px !important" }} />
            )
          }
          sx={{
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.common.white,
            textTransform: "none",
            borderRadius: "10px",
            fontWeight: 600,
            px: 2.5,
            boxShadow: "none",
            "&:hover": {
              backgroundColor: theme.palette.primary.dark,
              boxShadow: "none",
            },
            "&.Mui-disabled": {
              backgroundColor: alpha(theme.palette.primary.main, isDarkMode ? 0.35 : 0.25),
              color: theme.palette.common.white,
            },
          }}
        >
          {assignStatus === "loading" ? "Assigning..." : "Assign"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AssignQuizModal;
