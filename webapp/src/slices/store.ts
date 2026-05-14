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

import authReducer from "@slices/authSlice/index";
import employeeReducer from "@slices/employeeSlice/employee";
import pageReducer from "@slices/pageSlice/page";
import routeReducer from "@slices/routeSlice/route";
import sectionReducer from "@slices/sectionSlice/section";
import commonReducer from "@slices/commonSlice/common";
import customButtonReducer from "@slices/customButtonSlice/customButton";
import customerTestimonialsReducer from "@slices/customerTestimonialSlice/customerTestimonial";

import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import quizReducer from "@slices/quizSlice/quiz";

enableMapSet();

export const store = configureStore({
  reducer: {
    employee: employeeReducer,
    page: pageReducer,
    route: routeReducer,
    section: sectionReducer,
    auth: authReducer,
    common: commonReducer,
    customButton: customButtonReducer,
    customerTestimonials: customerTestimonialsReducer,
    quiz: quizReducer,
  },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {auth: AuthState, employee: EmployeeState, page: PageState, form:}
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
