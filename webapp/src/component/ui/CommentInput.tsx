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

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Box,
  TextField,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Typography,
  Stack,
  CircularProgress,
  InputAdornment,
  IconButton,
  Chip,
  alpha,
  useTheme,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AlternateEmailIcon from "@mui/icons-material/AlternateEmail";
import CloseIcon from "@mui/icons-material/Close";
import { useAppDispatch, useAppSelector, RootState } from "@slices/store";
import { addComment } from "@slices/pageSlice/page";
import { fetchMentionSuggestions } from "@slices/pageSlice/page";
import { enqueueSnackbarMessage } from "@slices/commonSlice/common";
import { EmployeeSuggestion, MentionedUser } from "@/types/types";

interface CommentInputProps {
  contentId: number;
  onCommentPosted?: () => void;
}

// For matomo integration
declare let _paq: unknown[];

const CommentInput: React.FC<CommentInputProps> = ({ contentId, onCommentPosted }) => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [suggestions, setSuggestions] = useState<EmployeeSuggestion[]>([]);
  const [mentionedUsers, setMentionedUsers] = useState<MentionedUser[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userThumbnail = useAppSelector(
    (state: RootState) => state.auth.userInfo?.employeeThumbnail
  );
  const currentUserEmail = useAppSelector(
    (state: RootState) => state.auth.userInfo?.email ?? ""
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleCommentChange = useCallback(
    (newText: string) => {
      setText(newText);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      const mentionMatch = newText.match(/@([\w]*)$/);

      if (mentionMatch) {
        const query = mentionMatch[1];

        debounceTimerRef.current = setTimeout(() => {
          if (query.length >= 2) {
            setIsLoadingSuggestions(true);
            dispatch(fetchMentionSuggestions({ searchQuery: query }))
              .then((result) => {
                const payload = result.payload as EmployeeSuggestion[] | undefined;
                if (payload) {
                  const filteredSuggestions = payload.filter(
                    (suggestion) => suggestion.workEmail !== currentUserEmail
                  );
                  setSuggestions(filteredSuggestions);
                }
              })
              .catch(() => {
                setSuggestions([]);
              })
              .finally(() => {
                setIsLoadingSuggestions(false);
              });
          } else if (query.length === 0) {
            setSuggestions([]);
            setIsLoadingSuggestions(false);
          }
        }, 300);
      } else {
        setSuggestions([]);
        setIsLoadingSuggestions(false);
      }
    },
    [dispatch, currentUserEmail]
  );

  const selectMention = useCallback(
    (suggestion: EmployeeSuggestion) => {
      const textWithoutQuery = text.replace(/@[\w]*$/, "");
      const displayName = `${suggestion.firstName} ${suggestion.lastName} `;
      const newText = textWithoutQuery + displayName;

      const mentionedUser: MentionedUser = {
        name: `${suggestion.firstName} ${suggestion.lastName}`,
        email: suggestion.workEmail,
        thumbnail: suggestion.employeeThumbnail,
      };

      setMentionedUsers((prev) => {
        if (!prev.some((u) => u.email === mentionedUser.email)) {
          return [...prev, mentionedUser];
        }
        return prev;
      });

      setText(newText);
      setSuggestions([]);
    },
    [text]
  );

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleCommentChange(e.target.value);
  };

  const handleSendComment = async () => {
    if (!text.trim()) return;

    setIsPosting(true);
    const mentionedEmails = mentionedUsers.map((u: { email: string }) => u.email);

    try {
      const result = await dispatch(
        addComment({
          contentId,
          comment: text,
          mentionedEmails,
        })
      );

      if (result.payload) {
        setText("");
        setMentionedUsers([]);
        clearSuggestions();

        if (window.config?.IS_MATOMO_ENABLED) {
          _paq.push([
            "trackEvent",
            "User Interaction",
            "Add Comment",
            `Content ID: ${contentId}`,
          ]);
        }

        if (onCommentPosted) {
          onCommentPosted();
        }

        dispatch(
          enqueueSnackbarMessage({
            message: "Comment posted successfully",
            type: "success",
            anchorOrigin: { vertical: "bottom", horizontal: "right" },
          })
        );
      }
    } catch {
      dispatch(
        enqueueSnackbarMessage({
          message: "Failed to post comment",
          type: "error",
          anchorOrigin: { vertical: "bottom", horizontal: "right" },
        })
      );
    } finally {
      setIsPosting(false);
    }
  };

  const handleSuggestionClick = (suggestion: EmployeeSuggestion) => {
    selectMention(suggestion);
  };

  const handleRemoveMention = (email: string) => {
    setMentionedUsers((prev: MentionedUser[]) =>
      prev.filter((u: MentionedUser) => u.email !== email)
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendComment();
    }
    if (e.key === "Escape") {
      clearSuggestions();
    }
  };

  const isDark = theme.palette.mode === "dark";

  return (
    <Box sx={{ position: "relative", width: "100%" }}>
      <Stack spacing={1}>
        {/* Mentioned user chips*/}
        {mentionedUsers.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 0.75,
              px: 0.5,
            }}
          >
            {mentionedUsers.map(
              (user: { name: string; email: string; thumbnail?: string }) => (
                <Chip
                  key={user.email}
                  size="small"
                  avatar={
                    <Avatar
                      src={user.thumbnail}
                      sx={{ width: 20, height: 20 }}
                    />
                  }
                  label={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.3 }}>
                      <AlternateEmailIcon sx={{ fontSize: 11, opacity: 0.7 }} />
                      <Typography sx={{ fontSize: "0.75rem", fontWeight: 500 }}>
                        {user.name}
                      </Typography>
                    </Box>
                  }
                  onDelete={() => handleRemoveMention(user.email)}
                  deleteIcon={
                    <CloseIcon
                      sx={{
                        fontSize: "14px !important",
                        opacity: 0.6,
                        "&:hover": { opacity: 1 },
                      }}
                    />
                  }
                  sx={{
                    height: 26,
                    backdropFilter: "blur(12px)",
                    backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.18 : 0.1),
                    border: `1px solid ${alpha(theme.palette.primary.main, isDark ? 0.35 : 0.25)}`,
                    color: theme.palette.primary.main,
                    transition: "all 0.2s ease",
                    "& .MuiChip-avatar": { ml: 0.5 },
                    "& .MuiChip-label": { px: 0.75 },
                    "&:hover": {
                      backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.25 : 0.15),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.45)}`,
                    },
                  }}
                />
              )
            )}
          </Box>
        )}

        <Box sx={{ position: "relative" }}>
          {/* Conditional: Show TextField or Posting Indicator in same container */}
          <Box
            sx={{
              backdropFilter: "blur(16px)",
              backgroundColor: alpha(
                isDark ? theme.palette.common.white : theme.palette.common.black,
                isDark ? 0.04 : 0.02
              ),
              border: `1px solid ${alpha(
                isDark ? theme.palette.common.white : theme.palette.common.black,
                isDark ? 0.1 : 0.08
              )}`,
              borderRadius: "14px",
              transition: "all 0.25s ease",
              minHeight: isPosting ? "80px" : "auto",
              display: "flex",
              alignItems: "center",
              "&:hover": {
                backgroundColor: !isPosting ? alpha(
                  isDark ? theme.palette.common.white : theme.palette.common.black,
                  isDark ? 0.07 : 0.04
                ) : undefined,
                border: !isPosting ? `1px solid ${alpha(theme.palette.primary.main, 0.3)}` : undefined,
              },
            }}
          >
            {!isPosting ? (
              <TextField
                fullWidth
                multiline
                maxRows={4}
                placeholder="Add a comment… type @ to mention someone"
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                disabled={isPosting}
                variant="outlined"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start" sx={{ mr: 1, display: "flex", alignItems: "center" }}>
                      <Avatar
                        src={userThumbnail || ""}
                        sx={{
                          width: 32,
                          height: 32,
                          border: `2px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                          flexShrink: 0,
                        }}
                      />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end" sx={{ alignSelf: "center" }}>
                      <IconButton
                        edge="end"
                        onClick={handleSendComment}
                        disabled={!text.trim() || isPosting}
                        size="small"
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "10px",
                          backdropFilter: "blur(8px)",
                          backgroundColor: text.trim() && !isPosting
                            ? alpha(theme.palette.primary.main, 0.15)
                            : "transparent",
                          border: `1px solid ${
                            text.trim() && !isPosting
                              ? alpha(theme.palette.primary.main, 0.4)
                              : "transparent"
                          }`,
                          color: theme.palette.primary.main,
                          transition: "all 0.2s ease",
                          "&:hover": {
                            backgroundColor: alpha(theme.palette.primary.main, 0.25),
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.6)}`,
                            transform: "scale(1.05)",
                          },
                          "&.Mui-disabled": {
                            opacity: 0.25,
                            border: "1px solid transparent",
                            backgroundColor: "transparent",
                            transform: "none",
                          },
                        }}
                      >
                        <SendIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ),
                  sx: {
                    alignItems: "center",
                  },
                }}
                sx={{
                  width: "100%",
                  "& .MuiOutlinedInput-root": {
                    "& fieldset": {
                      border: "none",
                    },
                  },
                  "& .MuiInputBase-input": {
                    fontSize: "0.875rem",
                    lineHeight: 1.6,
                    py: 1.25,
                    px: 0.5,
                    "&::placeholder": {
                      opacity: 0.45,
                      fontStyle: "italic",
                    },
                  },
                }}
              />
            ) : (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  p: 1.5,
                  width: "100%",
                  animation: "fadeIn 0.3s ease-in-out",
                  "@keyframes fadeIn": {
                    from: { opacity: 0 },
                    to: { opacity: 1 },
                  },
                }}
              >
                <Avatar
                  sx={{
                    width: 36,
                    height: 36,
                    border: `2px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                    flexShrink: 0,
                  }}
                  src={userThumbnail || ""}
                />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CircularProgress size={16} thickness={4} sx={{ color: theme.palette.primary.main }} />
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        color: theme.palette.text.primary,
                        fontSize: "0.85rem",
                      }}
                    >
                      Posting your comment...
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>

          {/*Suggestion dropdown*/}
          {(suggestions.length > 0 || isLoadingSuggestions) && (
            <List
              sx={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: 0,
                right: 0,
                maxHeight: 240,
                overflowY: "auto",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                backgroundColor: alpha(
                  isDark ? "#1a1a2e" : theme.palette.background.paper,
                  isDark ? 0.75 : 0.88
                ),
                border: `1px solid ${alpha(
                  isDark ? theme.palette.common.white : theme.palette.common.black,
                  isDark ? 0.12 : 0.07
                )}`,
                borderRadius: "14px",
                zIndex: 20,
                boxShadow: `
                  0 8px 32px ${alpha(theme.palette.common.black, isDark ? 0.5 : 0.18)},
                  0 2px 8px ${alpha(theme.palette.common.black, 0.1)},
                  inset 0 1px 0 ${alpha(theme.palette.common.white, isDark ? 0.08 : 0.6)}
                `,
                p: 0.5,
                scrollbarWidth: "thin",
                scrollbarColor: `${alpha(theme.palette.primary.main, 0.3)} transparent`,
                "&::-webkit-scrollbar": { width: 4 },
                "&::-webkit-scrollbar-track": { background: "transparent", borderRadius: 999 },
                "&::-webkit-scrollbar-thumb": {
                  borderRadius: 999,
                  background: alpha(theme.palette.primary.main, 0.3),
                },
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
                    minHeight: "100px",
                  }}
                >
                  <CircularProgress size={20} thickness={4} sx={{ color: theme.palette.primary.main }} />
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      color: theme.palette.text.primary,
                      fontSize: "0.85rem",
                    }}
                  >
                    Finding people...
                  </Typography>
                </Box>
              ) : (
                <>
                  {/* subtle heading */}
                  <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5 }}>
                    <Typography
                      sx={{
                        fontSize: "0.68rem",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        opacity: 0.4,
                      }}
                    >
                      People
                    </Typography>
                  </Box>

                  {suggestions.map((suggestion: EmployeeSuggestion, index: number) => (
                    <ListItem
                      key={suggestion.workEmail}
                      component="button"
                      onClick={() => handleSuggestionClick(suggestion)}
                      sx={{
                        borderRadius: "10px",
                        cursor: "pointer",
                        border: "1px solid transparent",
                        transition: "all 0.15s ease",
                        py: 0.75,
                        px: 1,
                        mb: index < suggestions.length - 1 ? 0.25 : 0,
                        background: "transparent",
                        width: "100%",
                        textAlign: "left",
                        "&:hover": {
                          backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.15 : 0.07),
                          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                        },
                        "&:active": {
                          backgroundColor: alpha(theme.palette.primary.main, 0.2),
                          transform: "scale(0.99)",
                        },
                      }}
                    >
                      <ListItemAvatar sx={{ minWidth: 44 }}>
                        <Avatar
                          src={suggestion.employeeThumbnail}
                          sx={{
                            width: 32,
                            height: 32,
                            border: `1.5px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                            boxShadow: `0 2px 8px ${alpha(theme.palette.common.black, 0.2)}`,
                          }}
                        />
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Typography
                            sx={{
                              fontWeight: 600,
                              fontSize: "0.85rem",
                              lineHeight: 1.2,
                              color: theme.palette.text.primary,
                            }}
                          >
                            {suggestion.firstName} {suggestion.lastName}
                          </Typography>
                        }
                        secondary={
                          <Typography
                            sx={{
                              fontSize: "0.72rem",
                              opacity: isDark ? 0.7 : 0.5,
                              color: isDark ? theme.palette.common.white : "inherit",
                              lineHeight: 1.3,
                              mt: 0.15,
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
      </Stack>
    </Box>
  );
};

export default CommentInput;
