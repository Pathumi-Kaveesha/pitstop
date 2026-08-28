-- Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
-- WSO2 LLC. licenses this file to you under the Apache License,
-- Version 2.0 (the "License"); you may not use this file except
-- in compliance with the License.
-- You may obtain a copy of the License at
-- http://www.apache.org/licenses/LICENSE-2.0
-- Unless required by applicable law or agreed to in writing,
-- software distributed under the License is distributed on an
-- "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
-- KIND, either express or implied.  See the License for the
-- specific language governing permissions and limitations
-- under the License.

CREATE DATABASE IF NOT EXISTS `sales_pitstop`;

use sales_pitstop;

CREATE TABLE `route` (
  `route_id` int NOT NULL AUTO_INCREMENT COMMENT 'Route ID',
  `parent_id` int DEFAULT NULL COMMENT 'Parent ID of route',
   `label` varchar(100) DEFAULT NULL COMMENT 'Label of route',
   `title` varchar(50) DEFAULT NULL COMMENT 'Page title',
   `thumbnail` varchar(300) DEFAULT NULL COMMENT 'Page thumbnail',
   `description` text,
   `is_deleted` tinyint(1) DEFAULT '0' COMMENT 'Page deletion status',
   `route_path` varchar(300) DEFAULT NULL,
   `menu_item` varchar(100) DEFAULT NULL,
   `styling_info` json DEFAULT NULL,
   `route_order` int DEFAULT NULL,
   `isVisible` tinyint(1) DEFAULT '1',
   `isRouteVisible` tinyint(1) DEFAULT '1' COMMENT 'Visibility status of the route (1 = visible, 0 = hidden)',
    PRIMARY KEY (`route_id`),
    KEY `parent_id` (`parent_id`),
    CONSTRAINT `route_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `route` (`route_id`)
);

INSERT INTO route (parent_id, label, title, description, is_deleted)
VALUES (
        NULL,
        'home',
        'THIS . IS . YOUR',
        'Your platform to access sales resources to sell better!',
        0
    );

CREATE TABLE `section` (
  `section_id` int NOT NULL AUTO_INCREMENT COMMENT 'Section ID',
  `route_id` int DEFAULT NULL COMMENT 'Route ID',
  `title` varchar(300) DEFAULT NULL COMMENT 'Section title',
  `is_deleted` tinyint(1) DEFAULT '0' COMMENT 'Deletion status',
  `section_type` enum('section','image','vertical') DEFAULT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `redirect_url` varchar(500) DEFAULT NULL,
  `styling_info` json DEFAULT NULL,
  `section_order` int DEFAULT NULL,
  `description` text,
  `tags` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`section_id`),
  KEY `route_id` (`route_id`),
  CONSTRAINT `section_ibfk_1` FOREIGN KEY (`route_id`) REFERENCES `route` (`route_id`)
);

INSERT INTO section (
        section_id,
        route_id,
        title,
        description,
        section_type,
        section_order
    )
VALUES (
        -4,
        NULL,
        'Essentials',
        'Essential content for all users',
        'section',
        0
    );

CREATE TABLE `content` (
  `content_id` int NOT NULL AUTO_INCREMENT COMMENT 'Content ID',
  `section_id` int DEFAULT NULL COMMENT 'Section ID',
  `content_link` varchar(300) DEFAULT NULL COMMENT 'Content link',
  `content_type` enum('slides','youtube','page','gsheet','lms','salesforce','external','route_content') DEFAULT NULL,
  `content_sub_type` varchar(200) DEFAULT NULL COMMENT 'External subtype',
  `description` varchar(300) DEFAULT NULL COMMENT 'Content description',
  `is_deleted` tinyint(1) DEFAULT '0' COMMENT 'Deletion status',
  `created_on` timestamp(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `thumbnail` varchar(300) DEFAULT NULL,
  `styling_info` json DEFAULT NULL,
  `content_order` int DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `last_verified_by` varchar(50) DEFAULT NULL,
  `updated_on` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `last_verified_on` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `note` text,
  `tags` varchar(255) DEFAULT NULL,
  `route_id` int DEFAULT NULL,
  `parent_content_id` int DEFAULT NULL,
  `is_visible` tinyint(1) NOT NULL DEFAULT '1',
  `is_reused` tinyint(1) DEFAULT '0' COMMENT 'Indicates if content is reused and should be excluded from What’s New',
  PRIMARY KEY (`content_id`),
  KEY `section_id` (`section_id`),
  CONSTRAINT `content_ibfk_1` FOREIGN KEY (`section_id`) REFERENCES `section` (`section_id`)
);

CREATE TABLE `user` (
    `user_id` int NOT NULL AUTO_INCREMENT COMMENT 'User ID',
    `email` varchar(50) UNIQUE NOT NULL COMMENT 'User email',
    `thumbnail` varchar(300) DEFAULT NULL COMMENT 'User image',
    `first_name` varchar(50) DEFAULT NULL COMMENT 'User first name',
    `last_name` varchar(50) DEFAULT NULL COMMENT 'User last name',
    PRIMARY KEY `user_id` (`user_id`)
);

CREATE TABLE `comment` (
  `comment_id` int NOT NULL AUTO_INCREMENT COMMENT 'Comment ID',
  `content_id` int DEFAULT NULL COMMENT 'Content ID',
  `user_id` int DEFAULT NULL COMMENT 'User ID',
  `comment` varchar(500) NOT NULL COMMENT 'Comment',
  `is_deleted` tinyint DEFAULT '0',
  `created_on` timestamp(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_on` timestamp(6) NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`comment_id`),
  KEY `content_id` (`content_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `comment_ibfk_1` FOREIGN KEY (`content_id`) REFERENCES `content` (`content_id`),
  CONSTRAINT `comment_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
);

CREATE TABLE `content_like` (
  `like_id` int NOT NULL AUTO_INCREMENT COMMENT 'Like ID',
  `content_id` int DEFAULT NULL COMMENT 'Content ID',
  `user_id` int DEFAULT NULL COMMENT 'User ID',
  `status` tinyint(1) DEFAULT '0' COMMENT 'User like or not',
  PRIMARY KEY (`like_id`),
  UNIQUE KEY `unique_content_user` (`content_id`,`user_id`),
  KEY `content_id` (`content_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `content_like_ibfk_1` FOREIGN KEY (`content_id`) REFERENCES `content` (`content_id`),
  CONSTRAINT `content_like_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
);

CREATE TABLE `audit` (
    `audit_id` int NOT NULL AUTO_INCREMENT,
    `action` varchar(100) DEFAULT NULL,
    `user_id` int DEFAULT NULL COMMENT 'User ID',
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`audit_id`),
    KEY `user_id` (`user_id`),
    CONSTRAINT `audit_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
);


DELIMITER //
CREATE TRIGGER before_route_insert 
BEFORE INSERT ON route 
FOR EACH ROW 
BEGIN
    DECLARE route_var VARCHAR(255);
    IF new.parent_id = 1 THEN
         SET NEW.route_path = CONCAT('/', NEW.label);
    ELSE 
        WITH recursive RecursivePaths AS (
                SELECT
                    route_id,
                    parent_id,
                    CONCAT('/', label) AS route_path,
                    label
                FROM
                    route
                WHERE 
                    parent_id = 1
            UNION ALL
                SELECT
                    r.route_id,
                    r.parent_id,
                    CONCAT(rp.route_path, '/', r.label) AS route_path,
                    r.label
                FROM
                    route r
                JOIN RecursivePaths rp 
                ON r.parent_id = rp.route_id
        )
    SELECT route_path INTO route_var
	FROM RecursivePaths
	WHERE route_id = new.parent_id;
        SET NEW.route_path = CONCAT(route_var, '/', NEW.label);
    END IF;
END;
//
DELIMITER;

-- Run this queries to after creating the trigger--
UPDATE route
SET route_path = 
(
	WITH recursive RecursivePaths AS (
        SELECT
			route_id,
            parent_id,
            CONCAT('/', label) AS route_path,
            label
        FROM
            route
        WHERE 
            parent_id = 1
        UNION ALL
        SELECT
			r.route_id,
            r.parent_id,
            CONCAT(rp.route_path, '/', r.label) AS route_path,
            r.label
        FROM
            route r
            JOIN RecursivePaths rp ON r.parent_id = rp.route_id
    )
    SELECT route_path AS path
    FROM RecursivePaths rs
    WHERE rs.route_id = route.route_id
);

UPDATE section
SET section_type = 'section'
WHERE section_type IS NULL;

ALTER TABLE route ADD COLUMN `route_order` INT;
UPDATE route SET `route_order` = route_id;
DELIMITER //
CREATE TRIGGER before_insert_route
BEFORE INSERT ON route
FOR EACH ROW
BEGIN
    DECLARE max_order INT;
    SELECT IFNULL(MAX(`route_order`), 0) INTO max_order FROM route;
    SET NEW.`route_order` = max_order + 1;
END//
DELIMITER ;

ALTER TABLE content ADD COLUMN `content_order` INT;
UPDATE content SET `content_order` = content_id;
DELIMITER //
CREATE TRIGGER before_insert_content
BEFORE INSERT ON content
FOR EACH ROW
BEGIN
    DECLARE max_order INT;
    SELECT IFNULL(MAX(`content_order`), 0) INTO max_order FROM content;
    SET NEW.`content_order` = max_order + 1;
END//
DELIMITER ;

UPDATE section SET `section_order` = section_id;
DELIMITER //
CREATE TRIGGER before_insert_section
BEFORE INSERT ON section
FOR EACH ROW
BEGIN
    DECLARE max_order INT;
    SELECT IFNULL(MAX(`section_order`), 0) INTO max_order FROM section;
    SET NEW.`section_order` = max_order + 1;
END//
DELIMITER ;

ALTER TABLE route
ADD COLUMN `isRouteVisible` TINYINT(1) DEFAULT 1 COMMENT 'Visibility status of the route (1 = visible, 0 = hidden)';
ALTER TABLE content
MODIFY COLUMN content_type ENUM(
        'slides',
        'youtube',
        'page',
        'gsheet',
        'lms',
        'salesforce',
        'external',
        'route_content'
    );

CREATE TABLE `custom_buttons` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `content_id` INT NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `icon` VARCHAR(255),
    `color` VARCHAR(20) CHECK (`color` IN ('blue', 'green', 'red', 'orange')),
    `action` VARCHAR(50) CHECK (`action` IN ('link', 'download')),
    `action_value` VARCHAR(255),
    `is_visible` BOOLEAN DEFAULT TRUE,
    `is_deleted` BOOLEAN DEFAULT FALSE,
    `button_order` INT,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`content_id`) REFERENCES `content` (`content_id`) ON DELETE CASCADE
);

CREATE TABLE pinned_content (
    `user_email` VARCHAR(255) NOT NULL,
    `content_id` INT NOT NULL,
    `pinned_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_email`, `content_id`)
);
CREATE TABLE `customer_testimonial` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `logo_url` VARCHAR(500) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `sub_title` VARCHAR(255) NULL,
    `website_url` VARCHAR(500) NOT NULL,
    `link_label` VARCHAR(50) NOT NULL DEFAULT 'Visit Website',
    `created_by` VARCHAR(320) NOT NULL,
    `updated_by` VARCHAR(320),
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `is_visible` TINYINT(1) NOT NULL DEFAULT 1,
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
);
ALTER TABLE `customer_testimonial`
ADD COLUMN `is_shareable` TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE `tag` (
  `tag_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `color` varchar(10) DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`tag_name`)
);

ALTER TABLE `tag`
MODIFY COLUMN `tag_name` VARCHAR(255) COLLATE utf8mb4_bin NOT NULL;

CREATE TABLE `quiz` (
  `quiz_id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text,
  `thumbnail` varchar(500) DEFAULT NULL,
  `passing_score` int NOT NULL DEFAULT '70' COMMENT 'Minimum % to pass',
  `due_date` timestamp NULL DEFAULT NULL,
  `assigned_user_ids` json DEFAULT NULL COMMENT 'Array of user IDs this quiz is assigned',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `status` varchar(20) NOT NULL DEFAULT 'DRAFTED',
  `created_by` varchar(50) NOT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`quiz_id`)
);

CREATE TABLE `question` (
  `question_id` int NOT NULL AUTO_INCREMENT,
  `question_number` int NOT NULL COMMENT 'Display number scoped per quiz (1, 2, 3...)',
  `quiz_id` int NOT NULL,
  `question_text` text NOT NULL,
  `question_type` varchar(100) NOT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` varchar(50) NOT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ref_links` json DEFAULT NULL,
  PRIMARY KEY (`question_id`),
  UNIQUE KEY `unique_question_number` (`quiz_id`,`question_number`) COMMENT 'No duplicate numbers within a quiz',
  KEY `quiz_id` (`quiz_id`),
  CONSTRAINT `question_ibfk_1` FOREIGN KEY (`quiz_id`) REFERENCES `quiz` (`quiz_id`)
) ;

CREATE TABLE `answer` (
  `answer_id` int NOT NULL AUTO_INCREMENT,
  `question_id` int NOT NULL,
  `answer_text` text NOT NULL,
  `is_correct` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` varchar(50) NOT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`answer_id`),
  KEY `question_id` (`question_id`),
  CONSTRAINT `answer_ibfk_1` FOREIGN KEY (`question_id`) REFERENCES `question` (`question_id`)
);

CREATE TABLE `quiz_feedback` (
  `feedback_id` int NOT NULL AUTO_INCREMENT,
  `quiz_id` int NOT NULL,
  `user_id` int NOT NULL,
  `feedback_text` text NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`feedback_id`),
  KEY `idx_quiz_id` (`quiz_id`),
  CONSTRAINT `fk_quiz_feedback_quiz` FOREIGN KEY (`quiz_id`) REFERENCES `quiz` (`quiz_id`)
  CONSTRAINT `fk_quiz_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
) ;

CREATE TABLE `user_answer` (
  `user_answer_id` int NOT NULL AUTO_INCREMENT,
  `quiz_id` int NOT NULL,
  `user_id` int NOT NULL,
  `question_id` int NOT NULL,
  `selected_answer_id` int DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_answer_id`),
  KEY `fk_ua_quiz` (`quiz_id`),
  KEY `fk_ua_question` (`question_id`),
  KEY `fk_ua_answer` (`selected_answer_id`),
  KEY `fk_ua_user` (`user_id`),
  CONSTRAINT `fk_ua_answer` FOREIGN KEY (`selected_answer_id`) REFERENCES `answer` (`answer_id`),
  CONSTRAINT `fk_ua_question` FOREIGN KEY (`question_id`) REFERENCES `question` (`question_id`),
  CONSTRAINT `fk_ua_quiz` FOREIGN KEY (`quiz_id`) REFERENCES `quiz` (`quiz_id`),
  CONSTRAINT `fk_ua_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
) ;

CREATE TABLE `user_activity_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_email` VARCHAR(255) NOT NULL,
  `user_name` VARCHAR(255),
  `department` VARCHAR(100),
  `region` VARCHAR(100),
  `event_type` VARCHAR(50) NOT NULL,
  `content_id` BIGINT,
  `session_id` VARCHAR(100),
  `metadata` JSON,
  `event_timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user_event` (`user_email`, `event_type`),
  INDEX `idx_event_content` (`event_type`, `content_id`),
  INDEX `idx_event_time` (`event_type`, `event_timestamp`),
  INDEX `idx_region_event` (`region`, `event_type`),
  INDEX `idx_session` (`session_id`)
);

ALTER TABLE `user_activity_logs` 
ADD COLUMN `meta_page_route` VARCHAR(255) 
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.pageRoute'))) VIRTUAL,
ADD INDEX `idx_meta_page_route` (`meta_page_route`);
