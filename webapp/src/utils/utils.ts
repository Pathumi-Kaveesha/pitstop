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

import { useEffect, useRef, useState } from "react";

import { GOOGLE_DOCS_DOMAIN, GOOGLE_DRIVE_DOMAIN } from "@config/constant";
import { CONTENT_SUBTYPE, FILETYPE } from "@utils/types";
import { QuestionFormData } from "@/types/types";

export const getGoogleDocsDownloadUrl = (url: string): string => {
  const fileId = extractFileIdFromURL(url);
  if (!fileId) return url;

  const cleanFileId = fileId.split("/")[0];

  if (url.includes("drive.google.com/file")) {
    return `https://drive.google.com/uc?export=download&id=${cleanFileId}`;
  }
  if (url.includes("docs.google.com/document")) {
    return `https://docs.google.com/document/d/${cleanFileId}/export?format=pdf`;
  }
  if (url.includes("docs.google.com/spreadsheets")) {
    return `https://docs.google.com/spreadsheets/d/${cleanFileId}/export?format=xlsx`;
  }
  if (url.includes("docs.google.com/presentation")) {
    return `https://docs.google.com/presentation/d/${cleanFileId}/export?format=pdf`;
  }
  if (url.includes("drive.google.com")) {
    return `https://drive.google.com/uc?export=download&id=${cleanFileId}`;
  }
  return url;
};

export const extractFileIdFromURL = (link: string | undefined): string | null => {
  if (!link) {
    return null;
  }
  const regex =
    /(?:https?:\/\/)?(?:docs\.google\.com\/(?:document\/d\/|presentation\/d\/|forms\/d\/|spreadsheets\/d\/|file\/d\/|viewer\?srcid=\S*?docid=|viewerng\/viewer?url=|document\/u\/\d\/d\/)|drive\.google\.com\/file\/d\/|drive\.google\.com\/open\?id=|drive\.google\.com\/drive\/folders\/|drive\.google\.com\/drive\/u\/\d\/folders\/)([a-zA-Z0-9_-]+)/;
  const match = link.match(regex);
  if (match && match[1]) {
    return match[1];
  } else {
    return null;
  }
};

export const isGoogleDriveFolderLink = (url: string): boolean => {
  return (
    url.includes(`${GOOGLE_DRIVE_DOMAIN}/drive/folders/`) ||
    (url.includes(`${GOOGLE_DRIVE_DOMAIN}/drive/u/`) && url.includes("/folders/"))
  );
};

export const extractVideoIdFromURL = (link: string): string | null => {
  const regex =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = link.match(regex);
  if (match && match[1]) {
    return match[1];
  } else {
    return null;
  }
};

export const extractPlaylistIdFromURL = (link: string): string | null => {
  const regex = /[?&]list=([a-zA-Z0-9_-]+)/;
  const match = link.match(regex);
  if (match && match[1]) {
    return match[1];
  } else {
    return null;
  }
};

export const getEmbedUrl = (
  type: FILETYPE,
  link: string,
  contentSubtype?: CONTENT_SUBTYPE,
): string => {
  let updatedLink = link;
  const fileId = extractFileIdFromURL(link);

  if (type === FILETYPE.Slide) {
    updatedLink = `https://docs.google.com/presentation/d/${fileId}/embed`;
  } else if (type === FILETYPE.GSheet) {
    updatedLink = `https://docs.google.com/spreadsheets/d/${fileId}/htmlview`;
  } else if (type === FILETYPE.Youtube) {
    const playlistId = extractPlaylistIdFromURL(link);
    if (playlistId) {
      updatedLink = `https://www.youtube.com/embed/videoseries?list=${playlistId}`;
    } else {
      const videoId = extractVideoIdFromURL(link);
      updatedLink = `https://www.youtube.com/embed/${videoId}`;
    }
  } else if (type === FILETYPE.External_Link && contentSubtype) {
    switch (contentSubtype) {
      case CONTENT_SUBTYPE.GDoc:
        if (fileId) {
          updatedLink = `https://docs.google.com/document/d/${fileId}/preview`;
        }
        break;
      case CONTENT_SUBTYPE.Pdf:
        if (fileId && (link.includes(GOOGLE_DRIVE_DOMAIN) || link.includes(GOOGLE_DOCS_DOMAIN))) {
          updatedLink = `https://drive.google.com/file/d/${fileId}/preview`;
        }
        break;
      case CONTENT_SUBTYPE.Video:
        if (fileId && (link.includes(GOOGLE_DRIVE_DOMAIN) || link.includes(GOOGLE_DOCS_DOMAIN))) {
          updatedLink = `https://drive.google.com/file/d/${fileId}/preview`;
        } else {
          updatedLink = link;
        }
        break;
      case CONTENT_SUBTYPE.Generic:
      default:
        updatedLink = link;
        break;
    }
  }
  return updatedLink;
};

// Keep the old function for backward compatibility
export const extractFileId = (type: string, link: string) => {
  return getEmbedUrl(type as FILETYPE, link);
};

export function useInViewport<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [isInViewport, setIsInViewport] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInViewport(entry.isIntersecting);
      },
      {
        threshold: 0.2,
        ...options,
      },
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [options]);

  return { ref, isInViewport };
}

export const emptyQuestion = (): QuestionFormData => ({
  text: "",
  type: "mcq_single",
  answers: [
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
  ],
  refLinks: [],
});

export const toDateTimeLocalValue = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};
