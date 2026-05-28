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

import React, { useEffect, useState, useRef, } from "react";
import {
  Box,
  Typography,
  Fab,
  Container,
  Alert,
  IconButton,
} from "@mui/material";
import { Add, ChevronRight } from "@mui/icons-material";
import { useAppDispatch, useAppSelector } from "@slices/store";
import { Role } from "@utils/types";
import { RootState } from "@slices/store";
import {
  fetchCustomerTestimonials,
  selectCustomerTestimonials,
  selectCustomerTestimonialState,
} from "@slices/customerTestimonialSlice/customerTestimonial";
import { CustomerTestimonial } from "@/types/types";
import CustomerTestimonialCard from "@components/ui/content/CustomerTestimonialCard";
import CustomerTestimonialDialogBox from "@components/dialogs/CustomerTestimonialDialogBox";
import DeleteDialogBox from "@components/dialogs/DeleteDialogBox";
import { useInViewport } from "@utils/utils";  

const CustomerTestimonialSection: React.FC = () => {
  const dispatch = useAppDispatch();
  const testimonials = useAppSelector(selectCustomerTestimonials);
  const testimonialsState = useAppSelector(selectCustomerTestimonialState);
  const roles = useAppSelector((state: RootState) => state.auth.roles);
  const isNavigating = useAppSelector((state: RootState) => state.common.navigationLoading);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [selectedTestimonial, setSelectedTestimonial] = useState<CustomerTestimonial | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [testimonialToDelete, setTestimonialToDelete] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pauseTimeoutRef = useRef<number | null>(null);

  const isAdmin = roles.includes(Role.SALES_ADMIN);
  const { ref, isInViewport } = useInViewport<HTMLDivElement>();

  useEffect(() => {
    if (testimonialsState === "idle") {
      dispatch(fetchCustomerTestimonials());
    }
  }, [dispatch, testimonialsState]);

  useEffect(() => {
    return () => {
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
      }
    };
  }, []);

  // Control animation based on viewport visibility
  useEffect(() => {
    if (scrollContainerRef.current) {
      if (isInViewport && !isPaused && !isNavigating) {
        scrollContainerRef.current.style.animationPlayState = 'running';
      } else {
        scrollContainerRef.current.style.animationPlayState = 'paused';
      }
    }
  }, [isInViewport, isPaused, isNavigating]);

  if (!isAdmin && testimonials.length < 4) {
    return null;
  }

  const handleAddTestimonial = () => {
    setDialogMode("create");
    setSelectedTestimonial(undefined);
    setDialogOpen(true);
  };

  const handleEditTestimonial = (testimonial: CustomerTestimonial) => {
    setDialogMode("edit");
    setSelectedTestimonial(testimonial);
    setDialogOpen(true);
  };

  const handleDeleteTestimonial = (testimonial: CustomerTestimonial) => {
    setTestimonialToDelete(testimonial.id);
    setDeleteDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setTestimonialToDelete(null);
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      
      const computedStyle = window.getComputedStyle(container);
      const transform = computedStyle.transform;
      
      let currentX = 0;
      if (transform !== 'none') {
        const matrix = transform.match(/matrix.*\((.+)\)/);
        if (matrix) {
          const values = matrix[1].split(', ');
          currentX = parseFloat(values[4]);
        }
      }
      
      const newX = currentX - 260;
      
      container.style.animation = 'none';
      container.style.transition = 'transform 0.5s ease-out';
      container.style.transform = `translate3d(${newX}px, 0, 0)`;
      setIsPaused(true);
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
      }
      
      pauseTimeoutRef.current = setTimeout(() => {
        if (container) {
          container.style.transition = '';
          void container.offsetWidth;
          container.style.animation = 'scroll 25s linear infinite';
          setIsPaused(false);
        }
      }, 3000);
    }
  };

  const handleMouseEnter = () => {
    if (scrollContainerRef.current && !isPaused) {
      scrollContainerRef.current.style.animationPlayState = 'paused';
    }
  };

  const handleMouseLeave = () => {
    if (scrollContainerRef.current && !isPaused) {
      scrollContainerRef.current.style.animationPlayState = 'running';
    }
  };

  return (
    <Box 
      ref={ref}
      sx={{ 
        pt: 4,
        pb: 8 , 
        background: (theme) => 
          theme.palette.mode === 'dark' 
            ? "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)"
            : "linear-gradient(135deg, #fff5f0 0%, #ffffff 100%)",
        position: "relative",
        overflow: "hidden",
        overflowY: "visible",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: (theme) =>
            theme.palette.mode === 'dark'
              ? "radial-gradient(circle at 20% 50%, rgba(255, 115, 0, 0.15) 0%, transparent 50%)"
              : "radial-gradient(circle at 20% 50%, rgba(255, 115, 0, 0.05) 0%, transparent 50%)",
          pointerEvents: "none",
        }
      }}
    >
      <Container maxWidth="xl" sx={{ position: "relative", zIndex: 1, px: { xs: 2, md: 6 } }}>
        <Box sx={{ position: "relative", mb: 3 }}>
          <Box sx={{ textAlign: "center", mb: 2 }}>
            <Typography
              variant="h3"
              gutterBottom
              sx={{ 
                mb: 1,
                background: (theme) =>
                  theme.palette.mode === 'dark'
                    ? "linear-gradient(135deg, #ff9944 0%, #ffbb77 100%)"
                    : "linear-gradient(135deg, #ff7300 0%, #ff9944 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Customer Spotlight
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ maxWidth: 500, mx: "auto", fontSize: "0.95rem" }}
            >
              See how leading companies are transforming their sales performance
            </Typography>
          </Box>

          {isAdmin && (
            <Fab
              size="small"
              onClick={handleAddTestimonial}
              sx={{
                position: "absolute",
                top: 0,
                right: 0,
                zIndex: 1,
                background: "linear-gradient(135deg, #ff7300 0%, #ff9944 100%)",
                color: "white",
                boxShadow: "0 4px 20px rgba(255, 115, 0, 0.3)",
                "&:hover": {
                  background: "linear-gradient(135deg, #ff8800 0%, #ffaa55 100%)",
                  boxShadow: "0 6px 24px rgba(255, 115, 0, 0.4)",
                  transform: "translateY(-2px)",
                },
                transition: "all 0.3s ease",
              }}
            >
              <Add />
            </Fab>
          )}
        </Box>

        {testimonials.length === 0 && isAdmin ? (
          <Alert 
            severity="warning" 
            sx={{ 
              textAlign: "center",
              borderLeft: "4px solid #ff7300",
            }}
          >
            No testimonials available. Add the first customer testimonial to get started.
          </Alert>
        ) : (
          <Box 
            ref={wrapperRef}
            sx={{ 
              position: "relative",
              width: "100vw",
              left: "50%",
              transform: "translateX(-50%)",
              overflow: "visible",
              py: 2,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Right Arrow */}
            {isAdmin && (
              <IconButton
                onClick={scrollRight}
                sx={{
                  position: "absolute",
                  right: 20,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 10,
                  background: "rgba(255, 255, 255, 0.95)",
                  width: 50,
                  height: 50,
                  boxShadow: "0 4px 16px rgba(255, 115, 0, 0.25)",
                  color: "#ff7300",
                  backdropFilter: "blur(10px)",
                  "&:hover": {
                    background: "#ff7300",
                    color: "white",
                    boxShadow: "0 6px 20px rgba(255, 115, 0, 0.4)",
                    transform: "translateY(-50%) scale(1.1)",
                  },
                  transition: "all 0.3s ease",
                }}
                aria-label="scroll-right"
              >
                <ChevronRight sx={{ fontSize: 32 }} />
              </IconButton>
            )}

            <Box
              ref={scrollContainerRef}
              sx={{
                display: "flex",
                gap: 2,
                py: 1,
                animation: "scroll 25s linear infinite",
                willChange: "transform",
                overflow: "visible",
                "@keyframes scroll": {
                  "0%": {
                    transform: "translate3d(0, 0, 0)",
                  },
                  "100%": {
                    transform: "translate3d(-25%, 0, 0)",
                  },
                },
              }}
            >
              {/* Create multiple sets for smoother infinite scroll */}
              {Array.from({ length: 8 }, (_, setIndex) => 
                testimonials.map((testimonial, index) => (
                  <Box
                    key={`testimonial-${setIndex}-${index}`}
                    sx={{
                      minWidth: {
                        xs: "220px",
                        sm: "240px",
                        md: "220px",
                        lg: "240px",
                      },
                      flexShrink: 0,
                      transform: "translateY(0)",
                      transition: "transform 0.3s ease",
                      "&:hover": {
                        transform: "translateY(-8px) scale(1.02)",
                        zIndex: 5,
                      },
                    }}
                  >
                    <CustomerTestimonialCard
                      testimonial={testimonial}
                      isAdmin={isAdmin}
                      onEdit={() => handleEditTestimonial(testimonial)}
                      onDelete={() => handleDeleteTestimonial(testimonial)}
                    />
                  </Box>
                ))
              )}
            </Box>
          </Box>
        )}
      </Container>

      <CustomerTestimonialDialogBox
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={dialogMode}
        initialData={selectedTestimonial}
      />

      <DeleteDialogBox
        type="testimonial"
        open={deleteDialogOpen}
        handleClose={handleCloseDeleteDialog}
        testimonialId={testimonialToDelete ?? undefined}
      />
    </Box>
  );
};

export default CustomerTestimonialSection;
