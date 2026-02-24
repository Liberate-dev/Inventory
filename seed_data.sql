INSERT INTO `rooms` (`id`, `name`, `category`, `type`, `capacity`, `created_at`) VALUES
(1, 'Computer Lab 1', 'lab', 'computer', 30, NOW()),
(2, 'Physics Lab', 'lab', 'physics', 24, NOW()),
(3, 'Biology Lab', 'lab', 'biology', 20, NOW()),
(4, 'Classroom X-1', 'non-lab', 'classroom', 36, NOW()),
(5, 'Principal Office', 'non-lab', 'office', 5, NOW()),
(6, 'Main Warehouse', 'non-lab', 'warehouse', 100, NOW());

INSERT INTO `containers` (`id`, `room_id`, `name`, `type`, `status`, `position_x`, `position_y`) VALUES
(1, 1, 'Rack Server', 'shelf', 'good', 0, 0),
(2, 1, 'Instructor Desk', 'table', 'good', 1, 0),
(3, 2, 'Equipment Cabinet', 'cupboard', 'good', 0, 1),
(4, 3, 'Glassware Cabinet', 'cupboard', 'good', 2, 2);

INSERT INTO `items` (`id`, `container_id`, `name`, `type`, `condition`, `status`, `category`) VALUES
(1, 1, 'Server Unit Dell PowerEdge', 'Electronics', 'good', 'in_use', 'IT'),
(2, 2, 'Instructor PC Monitor', 'Electronics', 'good', 'in_use', 'IT'),
(3, 3, 'Digital Multimeter', 'Tool', 'good', 'available', 'Physics'),
(4, 4, 'Microscope Binocular', 'Equipment', 'good', 'available', 'Biology');
