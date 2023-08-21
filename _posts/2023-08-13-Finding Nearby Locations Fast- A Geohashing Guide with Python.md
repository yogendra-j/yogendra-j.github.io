---
title: Finding Nearby Locations Fast- A Geohashing Guide with Python
date: 2023-08-13 00:00:00 +0530
categories: [system-design, python]
tags: [geohash, proximity, location]     # TAG names should always be lowercase
---

## Problem statement: 
The efficient way to find all items near a given location(lat, long). 
## The obvious solution:
- The easiest way would be to calculate the distance of all items from the given location. 
- Use the Haversine formula to calculate distance, then select items within a desirable range. 
- For a case like Uber, start with a threshold of 500 m; if no cabs are found in the 500 m range, then keep increasing the threshold. If no cabs are found even after increasing the threshold beyond the acceptable range, display the "can't find a ride right now" message. 
### Why it's not efficient? 
- There is no way to avoid linear search. 
- Indexing or sorting doesn't work for proximity searches. Unlike a simple list where items can be ranked, distances vary depending on location. For example, sorting restaurants by x-coordinates doesn't consider their y-coordinates. Since distance involves both, standard indexing or sorting methods, which rely on unidirectional ranking, are ineffective for this multidimensional problem 

### Simple implementation ([Github](https://github.com/yogendra-j/geohash-impl/small-experiments/blob/master/proximirt-service.ipynb)) 
```python
# Generating random locations of items (e.g., restaurants)
items = [(random.randint(0, 9999), random.randint(0, 9999)) for _ in range(3000000)]

# Threshold distance
threshold = 100

# Example coordinates of the client
client_x, client_y = 5000, 5000

def euclidean_distance(x1, y1, x2, y2):
  return math.sqrt((x1 - x2)**2 + (y1 - y2)**2)

def find_within_threshold(x, y, points, threshold):
  within_threshold = []
  
  for point in points:
    distance = euclidean_distance(x, y, point[0], point[1])
    if distance <= threshold:
      within_threshold.append(point)

  return within_threshold

# Time the execution
start_time = time.time()

items_within_threshold = find_within_threshold(client_x, client_y, items, threshold)

end_time = time.time()

print(f"Found {len(items_within_threshold)} items within a distance of {threshold}")
print(f"Execution time: {end_time - start_time} seconds")
# Found 989 items within a distance of 100
# Execution time: 2.297866106033325 seconds
```
## Better solution: Geohashing 
- Can the location data (latitude and longitude) be transformed into one value such that the items can be sorted based on the column? Then The client location could also be transformed and searched through in O(log(n)) time. 
- Geohashing does precisely this. Geohashing is a public-domain geocoding system that encodes a geographic location into a short string of characters. It helps with proximity searches by dividing the world into a grid of varying sizes and using a base-32 string to represent a specific cell within that grid.
- The length of the geohash depends on the desired accuracy. For example, a geohash with ten characters represents a grid with an area of 1.19 m x 0.59 m. 
- If desired accuracy is lower or the permissible search radius is higher, then only the first few characters can be used to compare from the client's geohash, the more characters match (from left to right), the lesser the area of the smallest common grid they both share. ![](https://storage.googleapis.com/memvp-25499.appspot.com/images/Screenshot%202023-08-13%20013955.png17d8c74d-6944-475f-ae28-8f97bffbfe4d) (Image from: https://www.geospatialworld.net/blogs/polygeohasher-an-optimized-way-to-create-geohashes/) 
### Simple Geohash Implementation ([Github](https://github.com/yogendra-j/geohash-impl/small-experiments/blob/master/proximirt-service.ipynb)) 
Even though libraries are available in most programming languages to calculate geohashes, let's try implementing a simplified version. I will use the data used in the previous solution to compare time. 
### Step 1: Dividing the Space 
You can think of geohashing as weaving two threads together. Imagine your x and y coordinates as two different colored threads. By weaving them into a single strand, you create a unique pattern corresponding to a specific grid cell on the map. Now we can use the interleaved coordinates to divide the space into grids. If the last 2 bits from both x and y coordinates are ignored,Â we end up with size 3 x 3 grids. For example, 16 can be represented by **1 0 0 0 0**. If the last two digits vary, they can go from 0 0 to 1 1. So the variation can be from 16 to 19. 
#### Code: 
```python
def interleave(x, y):
  result = 0
  for i in range(32):
    result |= ((x & (1 << i)) << i) | ((y & (1 << i)) << (i + 1))
  return result >> 4 # Exclude the last 4 bits
```
#### Explanation: 
This function interleaves the bits of the x and y coordinates to create a unique value representing a specific grid cell. It loops through the bits of the coordinates, interleaving them, and then shifts the result to exclude the last four bits. This is essential to merge the two coordinates into a unique value. 
### Step 2: 
Assigning Locations to Grids Next, we assign locations to grids using the unique values generated in step 1. 
#### Code: 
```python
  grids = defaultdict(list)

  for item in items:
    key = interleave(*item)
    grids[key].append(item)
```
#### Explanation: 
Here, each item's coordinates are passed to the `interleave` function, and the resulting key is used to group the items in a dictionary (`grids`) by their grid cell. Items with the same key are in the same grid cell. 
### Step 3: 
Searching for Items in Proximity We now search for items near a specific location by looking at the target grid and its neighboring cells. 
#### Code: 
```python
  count = 0

  for offset in range(-25, 26):
    for offset_y in range(-25, 26):

      neighbor_key = interleave(client_x + offset * 4, client_y + offset_y * 4)
      items_in_grid = grids[neighbor_key]
```
#### Explanation: 
Because the grid size is 3 x 3, adding 4 to the y coordinate of a point will shift it to the grid just above it, and subtracting it will shift it below. Similarly, adding or subtracting from the x coordinate will shift the point to the right or left. If we add 4 to both coordinates, the point will shift to the grid in the upper-right direction, and so on, we can navigate through all 8 neighbors of a grid. Similarly, subtracting/adding 8 (4 x 2) will allow us to navigate to second-level neighbors. 
### Step 4: 
Filtering Items within the Threshold Finally, we filter the items that are within the desired threshold. 
#### Code:
```python
  for item in items_in_grid:
    if euclidean_distance(*item, client_x, client_y) <= threshold:
      count += 1
```
#### Explanation: 
Here, the code iterates through the items in the target and neighboring grid cells, using the previously defined Euclidean distance function to determine if they are within the desired threshold. If they are, the count is incremented. 
## Time Comparison 
The naïve linear search took 2.2979 seconds, while the geohash implementation took only 0.0186 seconds, as shown in the output of the code snippets: - Naïve Approach: `Execution time: 2.297866106033325 seconds - Geohashing: `Time taken: 0.018601417541503906 seconds 
## Conclusion 
The code snippets above demonstrate the steps involved in geohashing, illustrating how it reduces complexity and improves efficiency for proximity searches. The time comparison shows a substantial improvement over the naive approach, making geohashing a powerful method for handling location-based searches.
